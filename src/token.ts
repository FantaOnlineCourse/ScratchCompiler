import { importSPKI, jwtVerify, errors } from "jose";

/**
 * 嵌入權杖驗證（A1-R1～R4、FR-EDT-009）。
 *
 * 權杖只回答一件事：「這次嵌入是不是主平台發起的」。本應用只持有**公鑰**，
 * 倉庫裡沒有任何機密。除了簽章、有效期與 audience 以外的欄位一律不讀——
 * 尤其不讀學生身分（A1-R4）。
 */

export const TOKEN_AUDIENCE = "editor-host";
const ALG = "ES256";

export type TokenCheck = { ok: true } | { ok: false; reason: "expired" | "invalid" };

export type TokenVerifier = (token: string) => Promise<TokenCheck>;

export function createTokenVerifier(publicKeyPem: string): TokenVerifier {
  // 金鑰只匯入一次；匯入失敗（設定錯誤）時，所有權杖一律視為無效。
  // 部署環境的變數欄位是單行，PEM 的換行寫成 `\n` 兩個字元，這裡還原成真正的換行。
  // 本機 .env 的雙引號值 Vite 會自己還原，Vercel 不會 —— 少了這行，正式環境每張權杖都驗不過。
  const key = importSPKI(publicKeyPem.replace(/\\n/g, "\n"), ALG).catch(() => null);

  return async (token) => {
    const k = await key;
    if (!k) return { ok: false, reason: "invalid" };
    try {
      await jwtVerify(token, k, { algorithms: [ALG], audience: TOKEN_AUDIENCE, requiredClaims: ["exp"] });
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e instanceof errors.JWTExpired ? "expired" : "invalid" };
    }
  };
}
