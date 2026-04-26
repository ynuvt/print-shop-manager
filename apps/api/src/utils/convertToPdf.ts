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

const IMAGE_EXTENSIONS = /\.(png|jpe?g|bmp|tiff?|webp|gif)$/i;

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

/**
 * Convert an image buffer to a PDF where the page size matches the image
 * dimensions exactly — no white A4 background, no scaling artifacts.
 */
async function convertImageToPdf(
  buffer: Buffer,
  fileName: string,
): Promise<ConvertResult> {
  const sharp = (await import("sharp")).default;
  const { PDFDocument } = await import("pdf-lib");

  // Use sharp to get image metadata and always convert to JPEG for embedding.
  // pdf-lib's PNG embedding produces flate streams that many PDF viewers
  // (including pdf.js) cannot parse, so we standardize on JPEG.
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width ?? 800;
  const height = metadata.height ?? 600;

  // Convert to JPEG (flatten transparency onto white background)
  const jpegBuffer = await sharp(buffer)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 95 })
    .toBuffer();

  const imageBytes = new Uint8Array(jpegBuffer);

  const pdfDoc = await PDFDocument.create();

  // Embed as JPEG — universally compatible with all PDF viewers
  const image = await pdfDoc.embedJpg(imageBytes);

  // Create a page sized exactly to the image dimensions (in points, 1px = 1pt)
  const page = pdfDoc.addPage([width, height]);

  // Draw the image filling the entire page — no margins, no white background
  page.drawImage(image, {
    x: 0,
    y: 0,
    width,
    height,
  });

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });

  const parsed = path.parse(sanitizeBaseName(fileName));
  let baseName = parsed.name.replace(/\.(png|jpe?g|bmp|tiff?|webp|gif)$/i, "");
  if (!baseName.trim()) baseName = "image";
  const pdfFileName = `${baseName}.pdf`;

  return {
    pdfBuffer: Buffer.from(pdfBytes),
    pdfFileName,
  };
}

export async function convertToPdfFromBuffer(
  buffer: Buffer,
  fileName: string,
): Promise<ConvertResult> {
  // ── Image files: use sharp + pdf-lib (exact page size, no white bg) ──
  if (IMAGE_EXTENSIONS.test(fileName)) {
    return convertImageToPdf(buffer, fileName);
  }

  // ── Office files: use LibreOffice as before ──
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
