/**
 * 唯讀模式（FR-EDT-006）：可看程式、可按綠旗執行，但不能修改。
 *
 * scratch-gui 沒有「可看不可改」的模式（isPlayerOnly 只剩舞台，看不到程式），
 * 所以用兩層做：
 *   1. CSS（editor.css 的 html.readonly 區塊）藏起積木調色盤、新增角色/背景、
 *      角色資訊欄、造型與音效分頁、選單列。
 *   2. 在捕獲階段攔下程式區裡對積木的拖曳、右鍵與刪除快捷鍵。
 *      程式區空白處的拖曳（捲動畫布）不攔，才看得到整份程式。
 *
 * 唯讀時 bridge 也不會送出 PROJECT_CHANGED，主平台不會因此存檔。
 */

const BLOCK_SELECTOR = ".blocklyDraggable, .blocklyFlyout, .blocklyToolboxDiv";
const EDIT_KEYS = new Set(["Delete", "Backspace"]);

let installed = false;

const isReadonly = () => document.documentElement.classList.contains("readonly");

function guardPointer(e: Event) {
  if (!isReadonly()) return;
  const target = e.target as Element | null;
  if (target?.closest?.(BLOCK_SELECTOR)) {
    e.stopPropagation();
    e.preventDefault();
  }
}

function guardContextMenu(e: Event) {
  if (!isReadonly()) return;
  const target = e.target as Element | null;
  if (target?.closest?.(".blocklySvg, .blocklyWorkspace, [class*='sprite-selector_']")) {
    e.stopPropagation();
    e.preventDefault();
  }
}

function guardKeys(e: KeyboardEvent) {
  if (!isReadonly()) return;
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
  const mod = e.ctrlKey || e.metaKey;
  if (EDIT_KEYS.has(e.key) || (mod && ["z", "y", "v", "x"].includes(e.key.toLowerCase()))) {
    e.stopPropagation();
    e.preventDefault();
  }
}

export function setReadonly(readonly: boolean) {
  if (!installed) {
    installed = true;
    for (const type of ["mousedown", "pointerdown", "touchstart", "dblclick"]) {
      window.addEventListener(type, guardPointer, { capture: true, passive: false });
    }
    window.addEventListener("contextmenu", guardContextMenu, { capture: true });
    window.addEventListener("keydown", guardKeys, { capture: true });
  }
  document.documentElement.classList.toggle("readonly", readonly);
}
