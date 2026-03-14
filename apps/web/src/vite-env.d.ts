/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAX_UPLOAD_MB?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
