/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Build-time API base (plan v2 §5), e.g. https://tma.<domain> in prod.
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
