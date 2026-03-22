import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_PUBLIC_BUCKET_URL = process.env.R2_PUBLIC_BUCKET_URL;

let r2Client: S3Client | null = null;

function getR2Client(): S3Client {
  if (r2Client) {
    return r2Client;
  }

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error(
      "R2 storage is not configured. Please set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.",
    );
  }

  r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });

  return r2Client;
}

function getBucketName(): string {
  if (!R2_BUCKET_NAME) {
    throw new Error(
      "R2_BUCKET_NAME is missing. Add it to apps/api/.env before starting the API.",
    );
  }

  return R2_BUCKET_NAME;
}

function getPublicUrlForKey(key: string): string {
  if (!R2_PUBLIC_BUCKET_URL) {
    throw new Error(
      "R2_PUBLIC_BUCKET_URL is missing. Add it to apps/api/.env before starting the API.",
    );
  }

  return `${R2_PUBLIC_BUCKET_URL.replace(/\/$/, "")}/${key}`;
}

export function buildR2ObjectKey(userId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  const timestamp = Date.now();
  return `jobs/${userId}/${timestamp}-${safeName}`;
}

export async function uploadBufferToR2(params: {
  key: string;
  buffer: Buffer;
  contentType: string;
}) {
  const bucket = getBucketName();
  const client = getR2Client();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.buffer,
      ContentType: params.contentType,
    }),
  );

  return {
    key: params.key,
    url: getPublicUrlForKey(params.key),
  };
}

function normalizePublicBucketUrl() {
  return (R2_PUBLIC_BUCKET_URL ?? "").replace(/\/$/, "");
}

export function getR2ObjectKeyFromUrl(url: string): string {
  const publicBase = normalizePublicBucketUrl();

  if (publicBase && url.startsWith(`${publicBase}/`)) {
    return decodeURIComponent(url.slice(publicBase.length + 1));
  }

  try {
    const parsed = new URL(url);
    const keyFromPath = parsed.pathname.replace(/^\//, "");
    if (!keyFromPath) {
      throw new Error("missing object key");
    }
    return decodeURIComponent(keyFromPath);
  } catch {
    throw new Error("Could not derive R2 object key from file URL.");
  }
}

export async function deleteObjectFromR2ByKey(key: string) {
  const bucket = getBucketName();
  const client = getR2Client();

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
}

export async function deleteObjectFromR2ByUrl(url: string) {
  const key = getR2ObjectKeyFromUrl(url);
  await deleteObjectFromR2ByKey(key);
}
