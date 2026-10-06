// 把上游 scratch-gui 的預建產物複製到 public/，由 Vite 原樣當靜態檔輸出。
//
// 為什麼不讓 Vite 重新打包 scratch-gui：上游的 webpack 產物把 publicPath 寫死為 "/"，
// 執行期會從網站根目錄的 /chunks/、/static/ 載入延遲區塊與素材。原樣放在根目錄
// 最不容易出錯，也讓「上游程式碼」與「本應用程式碼」在建置產物中清楚分開。
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "node_modules", "@scratch", "scratch-gui", "dist");
const pub = join(root, "public");

if (!existsSync(dist)) {
  console.error("找不到 @scratch/scratch-gui/dist，請先 npm install");
  process.exit(1);
}

const noMaps = (src) => !src.endsWith(".map");

for (const dir of ["gui", "chunks", "static"]) rmSync(join(pub, dir), { recursive: true, force: true });
mkdirSync(join(pub, "gui"), { recursive: true });

cpSync(join(dist, "scratch-gui-standalone.js"), join(pub, "gui", "scratch-gui-standalone.js"));
cpSync(join(dist, "scratch-gui-standalone.js.LICENSE.txt"), join(pub, "gui", "scratch-gui-standalone.js.LICENSE.txt"));
cpSync(join(dist, "chunks"), join(pub, "chunks"), { recursive: true, filter: noMaps });
cpSync(join(dist, "static"), join(pub, "static"), { recursive: true, filter: noMaps });
cpSync(join(dist, "extension-worker.js"), join(pub, "extension-worker.js"));
for (const f of readdirSync(dist)) if (f.endsWith(".hex")) cpSync(join(dist, f), join(pub, f));

console.log("scratch-gui 靜態產物已複製到 public/");
