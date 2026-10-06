/**
 * 主平台 ⇄ 編輯器宿主的 postMessage 協定（A1-editor-host.md §3）。
 *
 * 這是兩個程式之間唯一的契約。主平台依規格文件自行實作它那一側，
 * **不得**複製本檔——否則主平台就含有本倉庫（AGPL）的程式碼。
 * 任何變更都要同步修改規格並提升版本。
 */

export const PROTOCOL_VERSION = "1.1";

export type ProjectType = "classwork" | "assignment";
export type SnapshotReason = "autosave" | "manual" | "submit";
/** `player` 只有舞台與綠旗（Scratch 的作品頁），`editor` 是完整編輯器。1.1 新增。 */
export type EditorView = "player" | "editor";

export type ErrorCode =
  | "INVALID_TOKEN"
  | "PROTOCOL_MISMATCH"
  | "INVALID_MESSAGE"
  | "LOAD_FAILED"
  | "SNAPSHOT_FAILED"
  | "EDITOR_CRASHED";

type Envelope<T extends string, P> = { protocolVersion: string; type: T; payload: P };

// ── 主平台 → 編輯器 ─────────────────────────────────────────────────────
export type LoadProject = Envelope<
  "LOAD_PROJECT",
  {
    requestId: string;
    token: string;
    project_type: ProjectType;
    /** null 表示開啟空白專案（FR-EDT-003）。 */
    project: ArrayBuffer | null;
    readonly: boolean;
  }
>;
export type RequestSnapshot = Envelope<
  "REQUEST_SNAPSHOT",
  { requestId: string; project_type: ProjectType; reason: SnapshotReason }
>;
export type SetReadonly = Envelope<"SET_READONLY", { readonly: boolean }>;
export type SetView = Envelope<"SET_VIEW", { view: EditorView }>;
export type HostMessage = LoadProject | RequestSnapshot | SetReadonly | SetView;

// ── 編輯器 → 主平台 ─────────────────────────────────────────────────────
export type Ready = Envelope<"READY", { protocolVersion: string; editorVersion: string }>;
export type ProjectLoaded = Envelope<"PROJECT_LOADED", { requestId: string; project_type: ProjectType }>;
export type ProjectChanged = Envelope<"PROJECT_CHANGED", { changedAt: string }>;
export type SnapshotResult = Envelope<
  "SNAPSHOT_RESULT",
  { requestId: string; project_type: ProjectType; ok: true; project: ArrayBuffer; sizeBytes: number }
>;
export type ErrorMessage = Envelope<"ERROR", { requestId?: string; code: ErrorCode; message: string }>;
export type EditorMessage = Ready | ProjectLoaded | ProjectChanged | SnapshotResult | ErrorMessage;

export const majorOf = (version: string): string => version.split(".")[0];

export type ParseResult =
  | { kind: "ok"; message: HostMessage }
  /** 不是本協定的訊息（例如瀏覽器擴充套件送的），直接忽略，不回應。 */
  | { kind: "foreign" }
  | { kind: "error"; code: "PROTOCOL_MISMATCH" | "INVALID_MESSAGE"; requestId?: string; message: string };

const PROJECT_TYPES: readonly string[] = ["classwork", "assignment"];
const REASONS: readonly string[] = ["autosave", "manual", "submit"];
const VIEWS: readonly string[] = ["player", "editor"];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/**
 * 解析主平台送來的訊息。只負責「形狀」，不做任何業務判斷——
 * project_type 只檢查是合法值，之後原樣回傳。
 */
export function parseHostMessage(data: unknown): ParseResult {
  if (!isObject(data) || typeof data.protocolVersion !== "string" || typeof data.type !== "string") {
    return { kind: "foreign" };
  }
  const payload = isObject(data.payload) ? data.payload : undefined;
  const requestId = payload && isNonEmptyString(payload.requestId) ? payload.requestId : undefined;

  // A1-P2：主版本不同即拒絕，不嘗試相容。
  if (majorOf(data.protocolVersion) !== majorOf(PROTOCOL_VERSION)) {
    return {
      kind: "error",
      code: "PROTOCOL_MISMATCH",
      requestId,
      message: `協定版本不符：收到 ${data.protocolVersion}，本編輯器為 ${PROTOCOL_VERSION}`,
    };
  }

  const invalid = (why: string): ParseResult => ({
    kind: "error",
    code: "INVALID_MESSAGE",
    requestId,
    message: `${data.type}：${why}`,
  });
  if (!payload) return invalid("缺少 payload");

  switch (data.type) {
    case "LOAD_PROJECT": {
      if (!requestId) return invalid("缺少 requestId");
      if (!isNonEmptyString(payload.token)) return invalid("缺少 token");
      if (!PROJECT_TYPES.includes(payload.project_type as string)) return invalid("project_type 不合法");
      if (payload.project !== null && !(payload.project instanceof ArrayBuffer)) {
        return invalid("project 必須是 ArrayBuffer 或 null");
      }
      if (typeof payload.readonly !== "boolean") return invalid("readonly 必須是布林值");
      return { kind: "ok", message: data as LoadProject };
    }
    case "REQUEST_SNAPSHOT": {
      if (!requestId) return invalid("缺少 requestId");
      if (!PROJECT_TYPES.includes(payload.project_type as string)) return invalid("project_type 不合法");
      if (!REASONS.includes(payload.reason as string)) return invalid("reason 不合法");
      return { kind: "ok", message: data as RequestSnapshot };
    }
    case "SET_READONLY": {
      if (typeof payload.readonly !== "boolean") return invalid("readonly 必須是布林值");
      return { kind: "ok", message: data as SetReadonly };
    }
    case "SET_VIEW": {
      if (!VIEWS.includes(payload.view as string)) return invalid("view 不合法");
      return { kind: "ok", message: data as SetView };
    }
    default:
      return invalid("未知的訊息類型");
  }
}

type PayloadOf<T extends EditorMessage["type"]> = Extract<EditorMessage, { type: T }>["payload"];

export function editorMessage<T extends EditorMessage["type"]>(type: T, payload: PayloadOf<T>): EditorMessage {
  return { protocolVersion: PROTOCOL_VERSION, type, payload } as EditorMessage;
}
