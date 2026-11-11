/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DEV_PORT?: string;
  /** Demo nalog dispečera — popunjava formu za prijavu i pali „brzu prijavu“. */
  readonly VITE_STAFF_EMAIL?: string;
  readonly VITE_STAFF_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
