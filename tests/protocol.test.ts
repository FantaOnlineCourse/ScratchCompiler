import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, parseHostMessage } from "../src/protocol";

const load = (overrides: Record<string, unknown> = {}, version = PROTOCOL_VERSION) => ({
  protocolVersion: version,
  type: "LOAD_PROJECT",
  payload: { requestId: "r1", token: "t", project_type: "classwork", project: null, readonly: false, ...overrides },
});

describe("parseHostMessage", () => {
  it("非本協定的訊息視為外來訊息，忽略", () => {
    expect(parseHostMessage("hello").kind).toBe("foreign");
    expect(parseHostMessage({ type: "x" }).kind).toBe("foreign");
    expect(parseHostMessage(null).kind).toBe("foreign");
  });

  it("接受合法的 LOAD_PROJECT（空白與 ArrayBuffer）", () => {
    expect(parseHostMessage(load()).kind).toBe("ok");
    expect(parseHostMessage(load({ project: new ArrayBuffer(4) })).kind).toBe("ok");
  });

  it("次版本不同仍接受", () => {
    expect(parseHostMessage(load({}, "1.9")).kind).toBe("ok");
  });

  it("主版本不同一律拒絕，並帶回 requestId", () => {
    expect(parseHostMessage(load({}, "2.0"))).toMatchObject({
      kind: "error",
      code: "PROTOCOL_MISMATCH",
      requestId: "r1",
    });
  });

  it.each([
    [{ token: "" }],
    [{ project_type: "homework" }],
    [{ project: "not-a-buffer" }],
    [{ readonly: "no" }],
    [{ requestId: undefined }],
  ])("LOAD_PROJECT 欄位不合法時回 INVALID_MESSAGE：%j", (o) => {
    expect(parseHostMessage(load(o))).toMatchObject({ kind: "error", code: "INVALID_MESSAGE" });
  });

  it("REQUEST_SNAPSHOT 需要 reason 與 project_type", () => {
    const base = { protocolVersion: PROTOCOL_VERSION, type: "REQUEST_SNAPSHOT" };
    expect(parseHostMessage({ ...base, payload: { requestId: "a", project_type: "assignment", reason: "submit" } }).kind).toBe("ok");
    expect(parseHostMessage({ ...base, payload: { requestId: "a", project_type: "assignment", reason: "later" } })).toMatchObject({
      code: "INVALID_MESSAGE",
      requestId: "a",
    });
  });

  it("未知類型回 INVALID_MESSAGE", () => {
    expect(parseHostMessage({ protocolVersion: PROTOCOL_VERSION, type: "SET_VIEW", payload: { view: "player" } })).toMatchObject({
      kind: "ok",
    });
    expect(parseHostMessage({ protocolVersion: PROTOCOL_VERSION, type: "SET_VIEW", payload: { view: "stage" } })).toMatchObject({
      kind: "error",
      code: "INVALID_MESSAGE",
    });
    expect(parseHostMessage({ protocolVersion: PROTOCOL_VERSION, type: "DELETE_ALL", payload: {} })).toMatchObject({
      code: "INVALID_MESSAGE",
    });
  });
});
