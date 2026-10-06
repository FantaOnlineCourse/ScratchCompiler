import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBridge, type EditorAdapter } from "../src/bridge";
import { PROTOCOL_VERSION, type EditorMessage, type EditorView } from "../src/protocol";
import type { TokenCheck } from "../src/token";

const ORIGIN = "https://app.example.test";

function setup(opts: { token?: TokenCheck; loadError?: Error; snapshotError?: Error } = {}) {
  const sent: { msg: EditorMessage; opts: unknown }[] = [];
  const parent = { postMessage: vi.fn((msg: EditorMessage, o: unknown) => sent.push({ msg, opts: o })) };
  let releaseLoad: (() => void) | null = null;
  const adapter: EditorAdapter & { loads: (ArrayBuffer | null)[]; readonly: boolean[]; views: EditorView[]; clears: number } = {
    loads: [],
    readonly: [],
    views: [],
    clears: 0,
    async load(p) {
      this.loads.push(p);
      if (opts.loadError) throw opts.loadError;
    },
    async clear() {
      this.clears++;
    },
    async snapshot() {
      if (opts.snapshotError) throw opts.snapshotError;
      return new Uint8Array([1, 2, 3]).buffer;
    },
    setReadonly(r) {
      this.readonly.push(r);
    },
    setView(v) {
      this.views.push(v);
    },
  };
  const verifyToken = vi.fn(async () => opts.token ?? ({ ok: true } as TokenCheck));
  const bridge = createBridge({
    parentOrigin: ORIGIN,
    parent: parent as unknown as Window,
    verifyToken,
    adapter,
    editorVersion: "test",
    changeThrottleMs: 1000,
  });
  const send = (type: string, payload: Record<string, unknown>, extra: Partial<MessageEvent> = {}) =>
    bridge.handleMessage({
      origin: ORIGIN,
      source: parent as unknown as Window,
      data: { protocolVersion: PROTOCOL_VERSION, type, payload },
      ...extra,
    } as MessageEvent);
  const load = (requestId = "L1", project: ArrayBuffer | null = null, readonly = false) =>
    send("LOAD_PROJECT", { requestId, token: "tok", project_type: "classwork", project, readonly });
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const types = () => sent.map((s) => s.msg.type);
  return { bridge, adapter, parent, sent, send, load, flush, types, verifyToken, releaseLoad };
}

describe("bridge", () => {
  it("READY 帶協定版本，只送給主平台來源", () => {
    const t = setup();
    t.bridge.announceReady();
    t.bridge.announceReady();
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].msg).toMatchObject({ type: "READY", payload: { protocolVersion: PROTOCOL_VERSION } });
    expect(t.sent[0].opts).toMatchObject({ targetOrigin: ORIGIN });
  });

  it("READY 之前的指令一律忽略", async () => {
    const t = setup();
    t.load();
    await t.flush();
    expect(t.sent).toHaveLength(0);
    expect(t.adapter.loads).toHaveLength(0);
  });

  it("忽略非允許來源或非 parent 視窗送來的訊息（FR-EDT-010）", async () => {
    const t = setup();
    t.bridge.announceReady();
    t.send("LOAD_PROJECT", { requestId: "x" }, { origin: "https://evil.test" });
    t.send("LOAD_PROJECT", { requestId: "x" }, { source: {} as Window });
    await t.flush();
    expect(t.types()).toEqual(["READY"]);
  });

  it("載入成功回 PROJECT_LOADED，原樣帶回 project_type 並套用唯讀", async () => {
    const t = setup();
    t.bridge.announceReady();
    const buf = new ArrayBuffer(8);
    t.send("LOAD_PROJECT", { requestId: "L1", token: "tok", project_type: "assignment", project: buf, readonly: true });
    await t.flush();
    expect(t.adapter.loads).toEqual([buf]);
    expect(t.adapter.readonly).toEqual([true]);
    expect(t.sent.at(-1)!.msg).toMatchObject({
      type: "PROJECT_LOADED",
      payload: { requestId: "L1", project_type: "assignment" },
    });
  });

  it("權杖無效時不載入任何專案，回 INVALID_TOKEN（A1-R2）", async () => {
    const t = setup({ token: { ok: false, reason: "expired" } });
    t.bridge.announceReady();
    t.load();
    await t.flush();
    expect(t.adapter.loads).toHaveLength(0);
    expect(t.adapter.clears).toBe(1);
    expect(t.sent.at(-1)!.msg).toMatchObject({ type: "ERROR", payload: { requestId: "L1", code: "INVALID_TOKEN" } });
  });

  it("內容損壞回 LOAD_FAILED 並回到空白", async () => {
    const t = setup({ loadError: new Error("bad zip") });
    t.bridge.announceReady();
    t.load();
    await t.flush();
    expect(t.adapter.clears).toBe(1);
    expect(t.sent.at(-1)!.msg).toMatchObject({ type: "ERROR", payload: { requestId: "L1", code: "LOAD_FAILED" } });
  });

  it("連續兩次 LOAD：以最後一次為準，前一次回 ERROR，每個 requestId 都有回應", async () => {
    const t = setup();
    t.bridge.announceReady();
    t.load("A");
    t.load("B");
    await t.flush();
    const replies = t.sent.slice(1).map((s) => [s.msg.type, (s.msg.payload as { requestId?: string }).requestId]);
    expect(replies).toEqual([
      ["ERROR", "A"],
      ["PROJECT_LOADED", "B"],
    ]);
    expect(t.adapter.loads).toHaveLength(1);
  });

  it("快照以 Transferable 回傳，並帶回 requestId 與 project_type", async () => {
    const t = setup();
    t.bridge.announceReady();
    t.load();
    t.send("REQUEST_SNAPSHOT", { requestId: "S1", project_type: "classwork", reason: "autosave" });
    await t.flush();
    const last = t.sent.at(-1)!;
    expect(last.msg).toMatchObject({
      type: "SNAPSHOT_RESULT",
      payload: { requestId: "S1", project_type: "classwork", ok: true, sizeBytes: 3 },
    });
    const project = (last.msg.payload as { project: ArrayBuffer }).project;
    expect((last.opts as { transfer: Transferable[] }).transfer).toEqual([project]);
  });

  it("尚未載入就要快照 → SNAPSHOT_FAILED；匯出出錯 → SNAPSHOT_FAILED", async () => {
    const t = setup({ snapshotError: new Error("boom") });
    t.bridge.announceReady();
    t.send("REQUEST_SNAPSHOT", { requestId: "S0", project_type: "classwork", reason: "manual" });
    t.load();
    t.send("REQUEST_SNAPSHOT", { requestId: "S1", project_type: "classwork", reason: "submit" });
    await t.flush();
    const errors = t.sent.filter((s) => s.msg.type === "ERROR").map((s) => s.msg.payload);
    expect(errors).toMatchObject([
      { requestId: "S0", code: "SNAPSHOT_FAILED" },
      { requestId: "S1", code: "SNAPSHOT_FAILED" },
    ]);
  });

  it("協定主版本不符回 PROTOCOL_MISMATCH", async () => {
    const t = setup();
    t.bridge.announceReady();
    t.bridge.handleMessage({
      origin: ORIGIN,
      source: t.parent as unknown as Window,
      data: { protocolVersion: "2.0", type: "LOAD_PROJECT", payload: { requestId: "L9" } },
    });
    expect(t.sent.at(-1)!.msg).toMatchObject({ type: "ERROR", payload: { requestId: "L9", code: "PROTOCOL_MISMATCH" } });
  });

  it("SET_READONLY 切換唯讀，不需回應", async () => {
    const t = setup();
    t.bridge.announceReady();
    t.send("SET_READONLY", { readonly: true });
    expect(t.adapter.readonly).toEqual([true]);
    expect(t.types()).toEqual(["READY"]);
  });

  it("SET_VIEW 切換播放畫面與編輯器，不需回應", () => {
    const t = setup();
    t.bridge.announceReady();
    t.send("SET_VIEW", { view: "player" });
    t.send("SET_VIEW", { view: "editor" });
    expect(t.adapter.views).toEqual(["player", "editor"]);
    expect(t.types()).toEqual(["READY"]);
  });

  describe("PROJECT_CHANGED", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("載入前、唯讀時不送；載入後節流送出", async () => {
      const t = setup();
      t.bridge.announceReady();
      t.bridge.notifyChanged();
      t.load();
      await vi.runAllTimersAsync();
      t.bridge.notifyChanged(); // 立即送
      t.bridge.notifyChanged(); // 併入尾端
      t.bridge.notifyChanged();
      expect(t.types().filter((x) => x === "PROJECT_CHANGED")).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(t.types().filter((x) => x === "PROJECT_CHANGED")).toHaveLength(2);

      t.send("SET_READONLY", { readonly: true });
      await vi.advanceTimersByTimeAsync(5000);
      t.bridge.notifyChanged();
      expect(t.types().filter((x) => x === "PROJECT_CHANGED")).toHaveLength(2);
    });
  });

  it("崩潰時送出 EDITOR_CRASHED", () => {
    const t = setup();
    t.bridge.announceReady();
    t.bridge.notifyCrash("oops");
    expect(t.sent.at(-1)!.msg).toMatchObject({ type: "ERROR", payload: { code: "EDITOR_CRASHED" } });
  });
});
