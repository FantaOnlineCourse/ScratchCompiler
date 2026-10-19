/**
 * 本應用的全部設定（A1 §5：僅驗證公鑰與允許來源；協定版本寫在 protocol.ts）。
 * 這些值在建置時注入，**都是可以公開的**——本倉庫不得含任何機密（NFR-EDT-004）。
 */
const env = import.meta.env;

/** 主平台簽發嵌入權杖所用私鑰對應的 ES256 公鑰（SPKI PEM）。可用 \n 表示換行，由 token.ts 還原。 */
export const TOKEN_PUBLIC_KEY: string = env.VITE_TOKEN_PUBLIC_KEY ?? "";

/** 允許嵌入本應用的主平台來源，逗號分隔。例：https://course.fantageeks.com */
export const ALLOWED_ORIGINS: readonly string[] = (env.VITE_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s: string) => s.trim())
  .filter(Boolean);

/** FR-EDT-014：本應用原始碼的公開倉庫網址（AGPL v3 義務）。 */
export const SOURCE_URL: string = env.VITE_SOURCE_URL || "https://github.com/REPLACE-ME/block-editor-host";

export const EDITOR_VERSION: string = __EDITOR_VERSION__;
