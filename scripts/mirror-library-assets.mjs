// 把 scratch-gui 素材庫（角色、造型、背景、音效）用到的檔案鏡像到 public/library-assets/。
//
// 為什麼：FR-EDT-012 規定編輯器執行時不得對外連線。上游預設從 cdn.assets.scratch.mit.edu
// 即時取檔；改為建置時下載一次、由本網域以靜態檔提供（見 src/editor/offline-storage.ts）。
// 已存在的檔案會略過，可重複執行。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const libs = join(root, "node_modules", "@scratch", "scratch-gui", "dist", "libraries");
const out = join(root, "public", "library-assets");
const SOURCE = "https://cdn.assets.scratch.mit.edu/internalapi/asset";
const CONCURRENCY = 8;

const ids = new Set();
const walk = (o) => {
  if (Array.isArray(o)) return o.forEach(walk);
  if (o && typeof o === "object") {
    if (typeof o.md5ext === "string") ids.add(o.md5ext);
    Object.values(o).forEach(walk);
  }
};
for (const f of ["sprites", "costumes", "backdrops", "sounds"]) {
  walk(JSON.parse(readFileSync(join(libs, `${f}.json`), "utf8")));
}

mkdirSync(out, { recursive: true });
const todo = [...ids].filter((id) => !existsSync(join(out, id)));
console.log(`素材共 ${ids.size} 個，需下載 ${todo.length} 個`);

let done = 0;
const failed = [];
async function worker() {
  for (let id = todo.shift(); id; id = todo.shift()) {
    try {
      const res = await fetch(`${SOURCE}/${id}/get/`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      writeFileSync(join(out, id), Buffer.from(await res.arrayBuffer()));
    } catch (e) {
      failed.push(`${id}: ${e.message}`);
    }
    if (++done % 100 === 0) console.log(`  ${done} 個完成`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

if (failed.length) {
  console.error(`有 ${failed.length} 個失敗：\n${failed.join("\n")}`);
  process.exit(1);
}
console.log("素材庫鏡像完成");
