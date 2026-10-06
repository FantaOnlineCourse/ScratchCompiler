import "./editor.css";
import { createBridge, type EditorStatus } from "./bridge";
import { ALLOWED_ORIGINS, EDITOR_VERSION, TOKEN_PUBLIC_KEY } from "./config";
import { mountEditor } from "./editor/mount";
import { createTokenVerifier } from "./token";
import { addSourceLink, hideScreen, showScreen } from "./ui/screens";

const STATUS_SCREENS: Partial<Record<EditorStatus, [string, string]>> = {
  "invalid-token": ["無法開啟編輯器", "授權已失效，請重新整理頁面後再試。"],
  "load-failed": ["作品無法載入", "作品檔案可能已損壞，請回到課程頁重新載入。"],
  mismatch: ["請重新整理頁面", "編輯器已更新，請重新整理頁面以取得最新版本。"],
  crashed: ["編輯器發生錯誤", "請重新載入編輯器；你的影片播放不受影響。"],
};

/** 嵌入本頁的主平台來源。Chrome/Safari 有 ancestorOrigins；Firefox 退而用 referrer。 */
function embedderOrigin(): string | null {
  const ancestors = (location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
  if (ancestors && ancestors.length > 0) return ancestors[0];
  try {
    return document.referrer ? new URL(document.referrer).origin : null;
  } catch {
    return null;
  }
}

function browserSupported(): boolean {
  const canvas = document.createElement("canvas");
  const webgl = !!(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
  return webgl && typeof TextEncoder !== "undefined" && typeof Blob.prototype.arrayBuffer === "function";
}

async function start() {
  addSourceLink();

  // FR-EDT-011：直接開啟網址（沒有被嵌入）時不提供編輯功能。
  if (window.parent === window) {
    showScreen("積木編輯器", "這是線上課程平台的程式編輯元件，只能從課程頁面開啟。本元件依 GNU AGPL v3 授權公開原始碼。");
    return;
  }

  const parentOrigin = embedderOrigin();
  if (!parentOrigin || !ALLOWED_ORIGINS.includes(parentOrigin)) {
    showScreen("無法開啟編輯器", "此頁面未被授權嵌入本編輯器。");
    return;
  }

  if (!browserSupported()) {
    showScreen("瀏覽器不支援", "請使用最新版的 Chrome、Edge、Firefox 或 Safari，並確認已開啟 WebGL。");
    return;
  }

  showScreen("編輯器載入中…", "");
  const container = document.getElementById("app")!;

  // bridge 需要 adapter，adapter 需要編輯器掛載完成；變動與崩潰事件先轉接到 bridge 建好為止。
  let bridge: ReturnType<typeof createBridge> | null = null;
  const { adapter } = await mountEditor({
    container,
    onChanged: () => bridge?.notifyChanged(),
    onCrash: (message) => bridge?.notifyCrash(message),
  });

  bridge = createBridge({
    parentOrigin,
    parent: window.parent,
    verifyToken: createTokenVerifier(TOKEN_PUBLIC_KEY),
    adapter,
    editorVersion: EDITOR_VERSION,
    onStatus: (status) => {
      const screen = STATUS_SCREENS[status];
      if (screen) showScreen(...screen);
      else if (status === "editing") hideScreen();
      else if (status === "waiting") showScreen("等待作品載入…", "");
    },
  });
  const b = bridge;
  window.addEventListener("message", (event) => b.handleMessage(event));
  b.announceReady();
}

start().catch((e) => {
  console.error("[editor-host] 啟動失敗", e);
  showScreen("編輯器載入失敗", "請重新整理頁面後再試。");
});
