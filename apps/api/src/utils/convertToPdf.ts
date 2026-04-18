import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type ConvertResult = {
  pdfBuffer: Buffer;
  pdfFileName: string;
};

function sanitizeBaseName(fileName: string): string {
  const base = path.basename(fileName || "document");
  return base.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function safeRemove(filePath: string) {
  try {
    await fs.unlink(filePath);
  } catch {
    // ignore cleanup errors
  }
}

async function safeRemoveDir(dirPath: string) {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

function stripTrailingWordExtensions(name: string): string {
  let result = name;
  // WhatsApp sometimes repeats extensions: file.docx.doc.docx
  while (/\.(docx|doc)$/i.test(result)) {
    result = result.replace(/\.(docx|doc)$/i, "");
  }
  return result || "document";
}

export async function convertToPdfFromBuffer(
  buffer: Buffer,
  fileName: string,
): Promise<ConvertResult> {
  const libreOfficeBin = process.env.LIBREOFFICE_BIN || "soffice";
  const sanitizedName = sanitizeBaseName(fileName);
  const parsed = path.parse(sanitizedName);
  const inputName = parsed.ext ? sanitizedName : `${sanitizedName}.bin`;

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "printowl-"));
  const inputPath = path.join(tempDir, inputName);
  const baseName = stripTrailingWordExtensions(parsed.name || "document");
  const expectedOutputName = `${baseName}.pdf`;
  const outputPath = path.join(tempDir, expectedOutputName);

  // LibreOffice can fail intermittently if multiple conversions share the same
  // user profile (profile lock). Use an isolated profile per conversion.
  const userInstallationPath = path.join(tempDir, "lo-profile");
  const userInstallationUri = `${pathToFileURL(userInstallationPath).toString()}/`;

  try {
    await fs.mkdir(userInstallationPath, { recursive: true });
    await fs.writeFile(inputPath, buffer);

    try {
      await execFileAsync(
        libreOfficeBin,
        [
          `-env:UserInstallation=${userInstallationUri}`,
          "--headless",
          "--nologo",
          "--nolockcheck",
          "--nodefault",
          "--nofirststartwizard",
          "--norestore",
          "--convert-to",
          "pdf",
          "--outdir",
          tempDir,
          inputPath,
        ],
        {
          timeout: 120_000,
          maxBuffer: 10 * 1024 * 1024,
        },
      );
    } catch (error) {
      const err = error as {
        message?: string;
        stdout?: string | Buffer;
        stderr?: string | Buffer;
      };

      const stdout =
        typeof err.stdout === "string"
          ? err.stdout
          : Buffer.isBuffer(err.stdout)
            ? err.stdout.toString("utf8")
            : "";
      const stderr =
        typeof err.stderr === "string"
          ? err.stderr
          : Buffer.isBuffer(err.stderr)
            ? err.stderr.toString("utf8")
            : "";

      const tail = (value: string, max = 1200) =>
        value.length > max ? value.slice(-max) : value;

      const details = [
        err.message ? `message: ${err.message}` : "",
        stderr ? `stderr (tail):\n${tail(stderr)}` : "",
        stdout ? `stdout (tail):\n${tail(stdout)}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      throw new Error(
        details ? `LibreOffice conversion failed\n\n${details}` : "LibreOffice conversion failed",
      );
    }

    // Try to read the expected output file
    let pdfBuffer: Buffer;
    let pdfFileName: string;
    
    try {
      pdfBuffer = await fs.readFile(outputPath);
      pdfFileName = expectedOutputName;
    } catch {
      // If expected file doesn't exist, find what was actually created
      const files = await fs.readdir(tempDir);
      const pdfFile = files.find((f) => f.toLowerCase().endsWith(".pdf"));
      
      if (!pdfFile) {
        throw new Error(
          `LibreOffice conversion failed: no PDF file created in ${tempDir}. Contents: ${files.join(", ") || "(empty)"}`,
        );
      }
      
      const actualPath = path.join(tempDir, pdfFile);
      pdfBuffer = await fs.readFile(actualPath);
      pdfFileName = pdfFile;
    }
    
    return { pdfBuffer, pdfFileName };
  } finally {
    await safeRemove(outputPath);
    await safeRemove(inputPath);
    await safeRemoveDir(tempDir);
  }
}
