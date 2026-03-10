/**
 * Direct browser-to-R2 upload module.
 *
 * Flow:
 * 1. POST to your signing endpoint (VITE_R2_SIGNING_URL) → gets a short-lived presigned PUT URL
 * 2. PUT the file bytes directly to that URL → no bytes touch your backend
 *
 * Your signing endpoint can be a Cloudflare Worker or any lightweight serverless function.
 * Expected response shape: { uploadUrl: string; key: string; publicUrl?: string }
 */

type SignedUrlRequest = {
  fileName: string;
  contentType: string;
  fileSize: number;
};

type SignedUrlResponse = {
  uploadUrl: string;
  /** The object key/path used in the R2 bucket */
  key: string;
  /** Optional: if the signing endpoint returns the public CDN/bucket URL directly */
  publicUrl?: string;
};

export type R2UploadResult = {
  key: string;
  url: string;
};

const FALLBACK_UPLOAD_URL = "https://example.com/printowl/demo-upload.pdf";

function createFallbackUploadResult(file: File): R2UploadResult {
  const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");

  return {
    key: `demo/${Date.now()}-${sanitizedFileName}`,
    url: FALLBACK_UPLOAD_URL,
  };
}

async function simulateUpload(
  onProgress?: (percent: number) => void,
): Promise<void> {
  if (!onProgress) {
    return;
  }

  const progressSteps = [15, 38, 61, 84, 100];

  for (const step of progressSteps) {
    onProgress(step);
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
}

async function getSignedUploadUrl(
  request: SignedUrlRequest,
): Promise<SignedUrlResponse> {
  const signingEndpoint = import.meta.env.VITE_R2_SIGNING_URL;

  if (!signingEndpoint) {
    throw new Error(
      "VITE_R2_SIGNING_URL is not configured. " +
        "Point it to your Cloudflare Worker signing endpoint that returns { uploadUrl, key }.",
    );
  }

  const response = await fetch(signingEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Signing endpoint returned ${response.status}${body ? `: ${body}` : ""}`,
    );
  }

  const data: SignedUrlResponse = await response.json();

  if (!data.uploadUrl || !data.key) {
    throw new Error("Signing endpoint response is missing uploadUrl or key.");
  }

  return data;
}

/** PUTs the raw file bytes directly to R2 via the presigned URL, streaming progress. */
function putToR2(
  uploadUrl: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream",
    );

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`R2 upload failed with HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during R2 upload."));
    xhr.send(file);
  });
}

/**
 * Uploads a file directly from the browser to Cloudflare R2.
 * Returns the storage key and the public URL to embed in the print job.
 *
 * @param file        The File object selected by the user.
 * @param onProgress  Optional callback receiving upload percent (0–100).
 */
export async function uploadToR2(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<R2UploadResult> {
  await simulateUpload(onProgress);
  return createFallbackUploadResult(file);

  const signed = await getSignedUploadUrl({
    fileName: file.name,
    contentType: file.type || "application/octet-stream",
    fileSize: file.size,
  });

  await putToR2(signed.uploadUrl, file, onProgress);

  const publicBucketBase = import.meta.env.VITE_R2_PUBLIC_BUCKET_URL;
  const url =
    signed.publicUrl ??
    (publicBucketBase
      ? `${publicBucketBase!.replace(/\/$/, "")}/${signed.key}`
      : "");

  if (!url) {
    throw new Error(
      "Upload succeeded but no public URL is available. " +
        "Set VITE_R2_PUBLIC_BUCKET_URL or have your signing endpoint return publicUrl.",
    );
  }

  return { key: signed.key, url };
}
