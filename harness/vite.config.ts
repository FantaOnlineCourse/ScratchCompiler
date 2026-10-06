import { defineConfig } from "vite";

// 假主平台：刻意跑在不同的 port（= 不同來源），才能驗證跨來源的 postMessage 行為。
export default defineConfig({
  root: import.meta.dirname,
  server: { port: 5174, strictPort: true },
});
