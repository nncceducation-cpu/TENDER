/// <reference types="vite/client" />

/** True in the public demo deployment and in the standalone build. */
declare const __TENDER_PUBLIC_DEMO__: boolean;

interface ImportMetaEnv {
  /**
   * Gemini key for the cloud second opinion. Set it in a local .env.local only.
   * The Pages workflow never defines it, so a deployed build has no key to leak.
   */
  readonly VITE_GEMINI_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
