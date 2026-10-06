import type { EditorAdapter } from "../bridge";
import type { EditorView } from "../protocol";
import type { ScratchGuiGlobal, ScratchVM } from "./gui-global";
import { createOfflineStorage } from "./offline-storage";
import { setReadonly } from "./readonly";

const GUI_SCRIPT = "/gui/scratch-gui-standalone.js";

/**
 * VM 的 PROJECT_CHANGED 不只在學生編輯時觸發——主平台載入專案後的數秒內也會冒出好幾次。
 * 所以每次主平台載入後，要等學生在編輯器裡**第一次實際操作**之後，變動才算數。
 * （不用「最近幾秒內有操作」的時間窗：學生按住積木拖很久再放開也是合法的編輯。）
 */
const USER_INPUT_EVENTS = ["pointerdown", "keydown", "drop", "input", "change"];

export interface MountedEditor {
  adapter: EditorAdapter;
}

export interface MountOptions {
  container: HTMLElement;
  /** 學生真正改動專案內容時呼叫（含 scratch-gui 內建的「從電腦載入」）。 */
  onChanged: () => void;
  /** scratch-gui 內部崩潰（出現上游的 crash 畫面）時呼叫。 */
  onCrash: (message: string) => void;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`無法載入 ${src}`));
    document.head.appendChild(el);
  });
}

/**
 * 載入並掛上 scratch-gui，等預設專案顯示完成後 resolve。
 * 回傳的 adapter 是 bridge 操作編輯器的唯一入口。
 */
export async function mountEditor({ container, onChanged, onCrash }: MountOptions): Promise<MountedEditor> {
  disableLeavePageConfirm();
  await loadScript(GUI_SCRIPT);
  const GUI = window.GUI as ScratchGuiGlobal | undefined;
  if (!GUI) throw new Error("scratch-gui 未正確載入");

  const storage = createOfflineStorage(GUI);
  const state = new GUI.EditorState({ locale: "zh-tw" }, () => ({ storage }));
  GUI.setAppElement(container);
  const root = GUI.createStandaloneRoot(state, container);

  let vm: ScratchVM | null = null;
  /** VM 原本的 loadProject；我們自己的載入走這條，不會被當成學生的變動。 */
  let rawLoad: ScratchVM["loadProject"] | null = null;
  let ownLoad = false;
  let touchedSinceLoad = false;
  for (const type of USER_INPUT_EVENTS) {
    window.addEventListener(type, () => (touchedSinceLoad = true), { capture: true, passive: true });
  }

  const ready = new Promise<void>((resolve) => {
    root.render({
      // FR-EDT-008：繁體中文，且不讓學生切換。
      canChangeLanguage: false,
      canChangeTheme: false,
      canChangeColorMode: false,
      // 不連任何伺服器：不存雲端、不分享、不用背包與雲端變數。
      canSave: false,
      canShare: false,
      canRemix: false,
      canCreateCopy: false,
      canCreateNew: false,
      canEditTitle: false,
      canUseCloud: false,
      backpackVisible: false,
      showComingSoon: false,
      enableCommunity: false,
      hideTutorialProjects: true,
      // "0" 是上游內建的預設專案（由 offline-storage 快取），開啟即顯示空白專案。
      projectId: "0",
      // A1 §6：允許學生用內建選單存到電腦／從電腦載入。
      canManageFiles: true,
      onVmInit: (instance: ScratchVM) => {
        vm = instance;
        wrapUserLoads(instance);
        instance.on("PROJECT_CHANGED", () => {
          if (ownLoad || !touchedSinceLoad) return;
          onChanged();
        });
      },
    });
    // 以 redux 的 loadingState 判斷預設專案已顯示（onProjectLoaded 在 standalone 版不一定會觸發）。
    const store = state.store;
    const isShowing = () => /^SHOWING_/.test(store.getState().scratchGui?.projectState?.loadingState ?? "");
    if (isShowing()) return resolve();
    const unsubscribe = store.subscribe(() => {
      if (isShowing()) {
        unsubscribe();
        resolve();
      }
    });
  });

  // 學生用內建選單「從電腦載入」時，VM 的 loadProject 不經過我們；包一層，
  // 讓它載入完成後也通知主平台（A1 §6），交給主平台的自動存檔接手。
  function wrapUserLoads(instance: ScratchVM) {
    const original = instance.loadProject.bind(instance);
    rawLoad = original;
    instance.loadProject = async (project) => {
      await original(project);
      if (!ownLoad) onChanged();
    };
  }

  watchForCrash(container, onCrash);
  await ready;
  if (!vm || !rawLoad) throw new Error("VM 未初始化");
  const theVm: ScratchVM = vm;
  const loadRaw: ScratchVM["loadProject"] = rawLoad;

  const load = async (project: ArrayBuffer | string) => {
    ownLoad = true;
    try {
      theVm.stopAll();
      await loadRaw(project);
    } finally {
      ownLoad = false;
      touchedSinceLoad = false;
    }
  };

  const adapter: EditorAdapter = {
    load: (project) => load(project ?? storage.defaultProjectJson()),
    clear: () => load(storage.defaultProjectJson()),
    async snapshot() {
      // saveProjectSb3 以 JSZip 非同步壓縮，不阻塞編輯（NFR-EDT-002）。
      const blob = await theVm.saveProjectSb3();
      return blob.arrayBuffer();
    },
    setReadonly,
    setView: (view: EditorView) => {
      // 上游的 GUI 以 redux 的 mode.isPlayerOnly 決定畫面：true 時只剩舞台與綠旗，
      // 與 Scratch 官網的作品頁相同。直接派發上游的 action，不改上游程式碼。
      state.store.dispatch({ type: "scratch-gui/mode/SET_PLAYER", isPlayerOnly: view === "player" });
    },
  };
  return { adapter };
}

/**
 * 上游在專案有變動時設定 window.onbeforeunload 跳「確定離開？」。本編輯器在 iframe 裡，
 * 那個對話框會擋住主平台自己的換頁；而存檔本來就是主平台的責任（未存檔的提醒也由主平台決定）。
 * 所以在載入上游之前，把這個屬性變成無作用。
 */
function disableLeavePageConfirm() {
  Object.defineProperty(window, "onbeforeunload", { configurable: true, get: () => null, set: () => {} });
}

/** 上游的錯誤邊界會把整個編輯器換成 crash 畫面；偵測到就回報一次。 */
function watchForCrash(container: HTMLElement, onCrash: (message: string) => void) {
  const observer = new MutationObserver(() => {
    if (container.querySelector("[class*='crash-message_crash-wrapper_']")) {
      observer.disconnect();
      onCrash("編輯器發生內部錯誤");
    }
  });
  observer.observe(container, { childList: true, subtree: true });
}
