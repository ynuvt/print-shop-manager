/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAX_UPLOAD_MB?: string;
  readonly VITE_API_ORIGIN?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  readonly VITE_SOCKET_URL?: string;
  readonly VITE_SOCKET_BASE_URL?: string;
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
