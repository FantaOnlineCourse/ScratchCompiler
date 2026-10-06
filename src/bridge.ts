import {
  PROTOCOL_VERSION,
  editorMessage,
  parseHostMessage,
  type EditorMessage,
  type EditorView,
  type LoadProject,
  type RequestSnapshot,
} from "./protocol";
import type { TokenVerifier } from "./token";

/** 編輯器本體（scratch-gui）對 bridge 暴露的最小介面。 */
export interface EditorAdapter {
  load(project: ArrayBuffer | null): Promise<void>;
  /** 回到空白狀態。載入失敗時用，確保不會停在半載入的專案上。 */
  clear(): Promise<void>;
  snapshot(): Promise<ArrayBuffer>;
  setReadonly(readonly: boolean): void;
  /** 切換只有舞台的播放畫面與完整編輯器。不動專案內容。 */
  setView(view: EditorView): void;
}

export type EditorStatus = "waiting" | "loading" | "editing" | "invalid-token" | "load-failed" | "mismatch" | "crashed";

export interface BridgeDeps {
  /** 嵌入本應用的主平台來源；已確認在允許清單內。 */
  parentOrigin: string;
  parent: Pick<Window, "postMessage">;
  verifyToken: TokenVerifier;
  adapter: EditorAdapter;
  editorVersion: string;
  onStatus?: (status: EditorStatus) => void;
  /** PROJECT_CHANGED 的最短間隔。 */
  changeThrottleMs?: number;
}

export interface Bridge {
  announceReady(): void;
  handleMessage(event: Pick<MessageEvent, "origin" | "source" | "data">): void;
  notifyChanged(): void;
  notifyCrash(message: string): void;
}

export function createBridge(deps: BridgeDeps): Bridge {
  const { parentOrigin, parent, verifyToken, adapter } = deps;
  const throttleMs = deps.changeThrottleMs ?? 1000;

  let ready = false;
  let loaded = false;
  let readonly = false;
  /** 所有會動到編輯器內容的工作依序執行，避免載入與匯出交錯。 */
  let queue: Promise<void> = Promise.resolve();
  /** 尚未完成的 LOAD_PROJECT；新的 LOAD 到來時舊的直接回 ERROR（A1 §6：以最後一次為準）。 */
  let pendingLoad: { requestId: string; superseded: boolean } | null = null;

  let lastChangeAt = 0;
  let trailing: ReturnType<typeof setTimeout> | null = null;

  // 只回傳給確認過的主平台來源，絕不用 "*"。
  const post = (msg: EditorMessage, transfer: Transferable[] = []) =>
    parent.postMessage(msg, { targetOrigin: parentOrigin, transfer });

  const fail = (code: Extract<EditorMessage, { type: "ERROR" }>["payload"]["code"], message: string, requestId?: string) =>
    post(editorMessage("ERROR", requestId ? { requestId, code, message } : { code, message }));

  const enqueue = (job: () => Promise<void>) => {
    queue = queue.then(job).catch((e) => {
      console.error("[editor-host] 未預期的錯誤", e);
    });
  };

  function onLoad(msg: LoadProject) {
    const { requestId, token, project, project_type } = msg.payload;
    if (pendingLoad) {
      pendingLoad.superseded = true;
      fail("LOAD_FAILED", "已被後續的 LOAD_PROJECT 取代", pendingLoad.requestId);
    }
    const mine = { requestId, superseded: false };
    pendingLoad = mine;

    enqueue(async () => {
      if (mine.superseded) return;
      loaded = false;
      deps.onStatus?.("loading");

      const check = await verifyToken(token);
      if (mine.superseded) return;
      if (!check.ok) {
        // A1-R2：驗證失敗不載入任何專案。
        await adapter.clear();
        pendingLoad = null;
        deps.onStatus?.("invalid-token");
        fail("INVALID_TOKEN", check.reason === "expired" ? "權杖已過期" : "權杖無效", requestId);
        return;
      }

      try {
        await adapter.load(project);
      } catch (e) {
        await adapter.clear().catch(() => {});
        if (mine.superseded) return;
        pendingLoad = null;
        deps.onStatus?.("load-failed");
        fail("LOAD_FAILED", `專案內容無法解析：${errorText(e)}`, requestId);
        return;
      }
      if (mine.superseded) return;

      readonly = msg.payload.readonly;
      adapter.setReadonly(readonly);
      loaded = true;
      pendingLoad = null;
      deps.onStatus?.("editing");
      post(editorMessage("PROJECT_LOADED", { requestId, project_type }));
    });
  }

  function onSnapshot(msg: RequestSnapshot) {
    const { requestId, project_type } = msg.payload;
    enqueue(async () => {
      if (!loaded) {
        fail("SNAPSHOT_FAILED", "目前沒有已載入的專案", requestId);
        return;
      }
      try {
        const project = await adapter.snapshot();
        post(
          editorMessage("SNAPSHOT_RESULT", {
            requestId,
            project_type,
            ok: true,
            project,
            sizeBytes: project.byteLength,
          }),
          [project],
        );
      } catch (e) {
        fail("SNAPSHOT_FAILED", `匯出失敗：${errorText(e)}`, requestId);
      }
    });
  }

  function sendChanged() {
    lastChangeAt = Date.now();
    post(editorMessage("PROJECT_CHANGED", { changedAt: new Date(lastChangeAt).toISOString() }));
  }

  return {
    announceReady() {
      if (ready) return;
      ready = true;
      deps.onStatus?.("waiting");
      post(editorMessage("READY", { protocolVersion: PROTOCOL_VERSION, editorVersion: deps.editorVersion }));
    },

    handleMessage(event) {
      // FR-EDT-010：只接受主平台視窗、且來源網域相符的訊息。
      if (event.source !== parent || event.origin !== parentOrigin) return;
      if (!ready) return;

      const parsed = parseHostMessage(event.data);
      if (parsed.kind === "foreign") return;
      if (parsed.kind === "error") {
        if (parsed.code === "PROTOCOL_MISMATCH") deps.onStatus?.("mismatch");
        fail(parsed.code, parsed.message, parsed.requestId);
        return;
      }

      const msg = parsed.message;
      switch (msg.type) {
        case "LOAD_PROJECT":
          return onLoad(msg);
        case "REQUEST_SNAPSHOT":
          return onSnapshot(msg);
        case "SET_READONLY":
          readonly = msg.payload.readonly;
          adapter.setReadonly(readonly);
          return;
        case "SET_VIEW":
          adapter.setView(msg.payload.view);
          return;
      }
    },

    notifyChanged() {
      // 載入中的變動來自載入本身；唯讀時不該有變動可存。
      if (!loaded || readonly || pendingLoad) return;
      const wait = lastChangeAt + throttleMs - Date.now();
      if (wait <= 0) return sendChanged();
      if (!trailing) {
        trailing = setTimeout(() => {
          trailing = null;
          if (loaded && !readonly && !pendingLoad) sendChanged();
        }, wait);
      }
    },

    notifyCrash(message) {
      deps.onStatus?.("crashed");
      fail("EDITOR_CRASHED", message);
    },
  };
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
