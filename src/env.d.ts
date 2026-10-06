/// <reference types="vite/client" />
declare const __EDITOR_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_TOKEN_PUBLIC_KEY?: string;
  readonly VITE_ALLOWED_ORIGINS?: string;
  readonly VITE_SOURCE_URL?: string;
}
