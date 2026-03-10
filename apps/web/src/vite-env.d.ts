/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_R2_SIGNING_URL?: string;
  /** Public base URL for the R2 bucket, used to construct file URLs after upload */
  readonly VITE_R2_PUBLIC_BUCKET_URL?: string;
  readonly VITE_MAX_UPLOAD_MB?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
