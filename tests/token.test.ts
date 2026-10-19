import { describe, expect, it } from "vitest";
import { SignJWT, exportSPKI, generateKeyPair } from "jose";
import { TOKEN_AUDIENCE, createTokenVerifier } from "../src/token";

const pair = await generateKeyPair("ES256", { extractable: true });
const other = await generateKeyPair("ES256", { extractable: true });
const verify = createTokenVerifier(await exportSPKI(pair.publicKey));

const sign = (key = pair.privateKey, { aud = TOKEN_AUDIENCE, exp = "10m" as string | number } = {}) =>
  new SignJWT({ sid: "student", lid: "lesson" })
    .setProtectedHeader({ alg: "ES256" })
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key);

describe("createTokenVerifier", () => {
  it("接受主平台簽發的有效權杖", async () => {
    expect(await verify(await sign())).toEqual({ ok: true });
  });

  it("過期權杖回 expired", async () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    expect(await verify(await sign(pair.privateKey, { exp: past }))).toEqual({ ok: false, reason: "expired" });
  });

  it("他人金鑰簽的權杖無效", async () => {
    expect(await verify(await sign(other.privateKey))).toEqual({ ok: false, reason: "invalid" });
  });

  it("audience 不符無效", async () => {
    expect(await verify(await sign(pair.privateKey, { aud: "something-else" }))).toEqual({ ok: false, reason: "invalid" });
  });

  it("亂碼無效", async () => {
    expect(await verify("not.a.jwt")).toEqual({ ok: false, reason: "invalid" });
  });

  it("接受換行寫成 \\n 兩個字元的單行公鑰（部署環境變數的格式）", async () => {
    const oneLine = (await exportSPKI(pair.publicKey)).trim().replace(/\n/g, "\\n");
    expect(oneLine).not.toContain("\n");
    expect(await createTokenVerifier(oneLine)(await sign())).toEqual({ ok: true });
  });

  it("公鑰設定錯誤時一律無效，不會拋錯", async () => {
    const broken = createTokenVerifier("-----BEGIN PUBLIC KEY-----\ngarbage\n-----END PUBLIC KEY-----");
    expect(await broken(await sign())).toEqual({ ok: false, reason: "invalid" });
  });
});
