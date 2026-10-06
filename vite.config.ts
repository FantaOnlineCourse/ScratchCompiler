/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import pkg from "./package.json" with { type: "json" };
import guiPkg from "./node_modules/@scratch/scratch-gui/package.json" with { type: "json" };

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const origins = (env.VITE_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  // 與 vercel.json 相同的政策（另允許 ws: 給 Vite 熱更新），讓本機也能驗證「被第三方網站嵌入時無法運作」。
  const headers = {
    "Content-Security-Policy": `frame-ancestors ${origins.join(" ") || "'none'"}; connect-src 'self' ws: blob: data:; object-src 'none'; base-uri 'self'`,
  };

  return {
    define: { __EDITOR_VERSION__: JSON.stringify(`${pkg.version}+scratch-gui.${guiPkg.version}`) },
    server: { port: 5173, strictPort: true, headers },
    preview: { port: 5173, strictPort: true, headers },
    build: { chunkSizeWarningLimit: 1000 },
    test: { environment: "node", include: ["tests/**/*.test.ts"] },
  };
});
