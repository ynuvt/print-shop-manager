import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { prisma } from "@printowl/db";

import socket from "../config/socket.js";
import { buildR2ObjectKey, uploadBufferToR2 } from "./r2Storage.js";

const execFileAsync = promisify(execFile);

const IMAGE_EXTENSIONS = /\.(png|jpe?g|bmp|tiff?|webp|gif)$/i;

// Target width for the stored first-page preview. Large enough to look crisp
// in the file card, small enough to stay cheap to generate and transfer.
const PREVIEW_WIDTH = 1000;

type PreviewKind = "image" | "pdf";

async function safeRemoveDir(dirPath: string) {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

/**
 * Render the first page / the image itself to a downscaled JPEG buffer.
 * Returns null if a preview could not be produced (non-fatal — the UI simply
 * keeps showing the "preparing" state).
 */
export async function generateFirstPagePreview(
  buffer: Buffer,
  kind: PreviewKind,
): Promise<Buffer | null> {
  if (kind === "image") {
    return generateImagePreview(buffer);
  }
  return generatePdfFirstPagePreview(buffer);
}

async function generateImagePreview(buffer: Buffer): Promise<Buffer | null> {
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(buffer)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .resize({ width: PREVIEW_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch (err) {
    console.error("[preview] image preview failed:", err);
    return null;
  }
}

/**
 * Render the first page of a PDF to a JPEG using the LibreOffice binary that is
 * already required for document conversion (no extra system dependency).
 * LibreOffice's PNG export only renders the first page, which is exactly what
 * we want for a thumbnail.
 */
async function generatePdfFirstPagePreview(
  pdfBuffer: Buffer,
): Promise<Buffer | null> {
  const libreOfficeBin = process.env.LIBREOFFICE_BIN || "soffice";
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "printowl-preview-"));
  const inputPath = path.join(tempDir, "input.pdf");
  const outputPath = path.join(tempDir, "input.png");
  const userInstallationPath = path.join(tempDir, "lo-profile");
  const userInstallationUri = `${pathToFileURL(userInstallationPath).toString()}/`;

  try {
    await fs.mkdir(userInstallationPath, { recursive: true });
    await fs.writeFile(inputPath, pdfBuffer);

    const loEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
      HOME: tempDir,
      SAL_USE_VCLPLUGIN: "svp",
    };

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
        "png",
        "--outdir",
        tempDir,
        inputPath,
      ],
      {
        timeout: 60_000,
        maxBuffer: 10 * 1024 * 1024,
        env: loEnv,
      },
    );

    let pngBuffer: Buffer;
    try {
      pngBuffer = await fs.readFile(outputPath);
    } catch {
      const files = await fs.readdir(tempDir);
      const pngFile = files.find((f) => f.toLowerCase().endsWith(".png"));
      if (!pngFile) {
        console.error(
          `[preview] LibreOffice produced no PNG in ${tempDir}. Contents: ${files.join(", ") || "(empty)"}`,
        );
        return null;
      }
      pngBuffer = await fs.readFile(path.join(tempDir, pngFile));
    }

    // Downscale/compress the rendered page to a reasonably sized JPEG.
    try {
      const sharp = (await import("sharp")).default;
      return await sharp(pngBuffer)
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .resize({ width: PREVIEW_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch {
      // If sharp post-processing fails, fall back to the raw PNG.
      return pngBuffer;
    }
  } catch (err) {
    console.error("[preview] pdf preview failed:", err);
    return null;
  } finally {
    await safeRemoveDir(tempDir);
  }
}

/**
 * Generate the first-page preview for a file row, upload it to R2 and persist
 * `previewUrl`. Best-effort: any failure leaves `previewUrl` null so the UI
 * keeps showing the "preparing" state. Emits `job-file-added` so connected web
 * clients refetch and pick up the new preview.
 */
export async function generateAndStorePreviewForFile(args: {
  fileId: string;
  jobId?: string | null;
  userId?: string | null;
  ownerKey: string;
  buffer: Buffer;
  kind: PreviewKind;
  baseName: string;
}): Promise<void> {
  try {
    const preview = await generateFirstPagePreview(args.buffer, args.kind);
    if (!preview) return;

    const key = buildR2ObjectKey(
      args.ownerKey || "preview",
      `${args.baseName.replace(/\.[^.]+$/, "") || "file"}.preview.jpg`,
    );
    const uploaded = await uploadBufferToR2({
      key,
      buffer: preview,
      contentType: "image/jpeg",
    });

    await prisma.file.update({
      where: { id: args.fileId },
      data: { previewUrl: uploaded.url },
    });

    if (args.jobId) socket.emit("job-file-added", args.jobId);
    if (args.userId) socket.emit("job-file-added", args.userId);
  } catch (err) {
    console.error("[preview] store failed:", err);
  }
}

/**
 * Resolve the preview kind from a file name. Images use sharp directly; every
 * other type is treated as a PDF (the stored file is always a PDF post-conversion).
 */
export function previewKindForFileName(fileName: string): PreviewKind {
  return IMAGE_EXTENSIONS.test(fileName) ? "image" : "pdf";
}

/**
 * Generate + store a preview for an already-uploaded file by downloading it
 * from its public URL. Used for web/presigned uploads that arrive READY and
 * already have a URL. Best-effort and never throws.
 */
export async function generatePreviewFromUrl(args: {
  fileId: string;
  jobId?: string | null;
  userId?: string | null;
  ownerKey: string;
  url: string;
  name: string;
}): Promise<void> {
  try {
    if (!args.url) return;
    const res = await fetch(args.url);
    if (!res.ok) {
      console.error(
        `[preview] could not download file for preview: ${res.status}`,
      );
      return;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    await generateAndStorePreviewForFile({
      fileId: args.fileId,
      jobId: args.jobId,
      userId: args.userId,
      ownerKey: args.ownerKey,
      buffer,
      kind: previewKindForFileName(args.name),
      baseName: args.name,
    });
  } catch (err) {
    console.error("[preview] generatePreviewFromUrl failed:", err);
  }
}
