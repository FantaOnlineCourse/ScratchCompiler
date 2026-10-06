// 本機開發用：產生一組 ES256 金鑰對。
//   - 公鑰寫入 .env.local（編輯器驗證用）
//   - 私鑰寫入 harness/.env.local（假主平台簽權杖用）
// 兩個檔都在 .gitignore 內。正式環境的私鑰只存在主平台的環境變數，絕不進本倉庫。
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { exportPKCS8, exportSPKI, generateKeyPair } from "jose";

const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
const oneLine = (pem) => pem.trim().replace(/\n/g, "\n");

const upsert = (file, key, value) => {
  const lines = existsSync(file) ? readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith(`${key}=`)) : [];
  lines.push(`${key}="${value}"`);
  writeFileSync(file, lines.join("\n") + "\n");
};

upsert(".env.local", "VITE_TOKEN_PUBLIC_KEY", oneLine(await exportSPKI(publicKey)));
upsert("harness/.env.local", "VITE_HARNESS_PRIVATE_KEY", oneLine(await exportPKCS8(privateKey)));
console.log("已寫入 .env.local（公鑰）與 harness/.env.local（私鑰）");
console.log("若要讓主平台連本機編輯器，把主平台 EDITOR_TOKEN_PRIVATE_KEY 設成同一把私鑰，或改用主平台的 gen-editor-keys 並更新 .env.local。");
