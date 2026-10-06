import { SignJWT, importPKCS8 } from "jose";

/**
 * 假主平台。依 A1 規格的協定獨立實作「主平台那一側」，用來在本機驗證編輯器。
 * 私鑰只來自 harness/.env.local（npm run dev-keys 產生，不進版控）。
 */
const EDITOR_ORIGIN = "http://localhost:5173";
const VERSION = "1.0";
const frame = document.getElementById("editor") as HTMLIFrameElement;
const log = document.getElementById("log")!;
const $ = (id: string) => document.getElementById(id)!;

let ready = false;
let seq = 0;
const nextId = () => `req-${++seq}`;
const pending = new Map<string, string>();

const privateKey = importPKCS8(
  (import.meta.env.VITE_HARNESS_PRIVATE_KEY ?? "").replace(/\n/g, "\n"),
  "ES256",
);

async function token(expiresIn: string | number = "10m") {
  return new SignJWT({ sid: "harness-student", lid: "harness-lesson" })
    .setProtectedHeader({ alg: "ES256" })
    .setAudience("editor-host")
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(await privateKey);
}

function write(line: string) {
  log.textContent = `${new Date().toLocaleTimeString()} ${line}\n${log.textContent}`;
}

function send(type: string, payload: Record<string, unknown>, transfer: Transferable[] = [], version = VERSION) {
  if (!ready) write(`⚠ 尚未收到 READY，照規格應忽略；仍送出以測試編輯器行為`);
  frame.contentWindow!.postMessage({ protocolVersion: version, type, payload }, EDITOR_ORIGIN, transfer);
  write(`→ ${type} ${JSON.stringify(payload, (k, v) => (v instanceof ArrayBuffer ? `<${v.byteLength} bytes>` : k === "token" ? "<jwt>" : v))}`);
}

async function load(project: ArrayBuffer | null, tok?: string) {
  const requestId = nextId();
  pending.set(requestId, "LOAD_PROJECT");
  send(
    "LOAD_PROJECT",
    {
      requestId,
      token: tok ?? (await token()),
      project_type: ($("ptype") as HTMLSelectElement).value,
      project,
      readonly: ($("ro") as HTMLInputElement).checked,
    },
    project ? [project] : [],
  );
}

function snapshot(reason: string) {
  const requestId = nextId();
  pending.set(requestId, reason);
  send("REQUEST_SNAPSHOT", { requestId, project_type: ($("ptype") as HTMLSelectElement).value, reason });
}

window.addEventListener("message", (e) => {
  if (e.origin !== EDITOR_ORIGIN || e.source !== frame.contentWindow) return;
  const { type, payload } = e.data ?? {};
  const shown = JSON.stringify(payload, (_k, v) => (v instanceof ArrayBuffer ? `<${v.byteLength} bytes>` : v));
  write(`← ${type} ${shown}`);
  if (type === "READY") ready = true;
  if (payload?.requestId) {
    const what = pending.get(payload.requestId);
    pending.delete(payload.requestId);
    if (type === "SNAPSHOT_RESULT" && what === "submit") {
      const url = URL.createObjectURL(new Blob([payload.project], { type: "application/x.scratch.sb3" }));
      Object.assign(document.createElement("a"), { href: url, download: "snapshot.sb3" }).click();
      URL.revokeObjectURL(url);
    }
  }
  if (pending.size) write(`  （尚無回應的 requestId：${[...pending.keys()].join(", ")}）`);
});

$("load-blank").onclick = () => load(null);
$("file").onchange = async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) await load(await f.arrayBuffer());
};
$("load-corrupt").onclick = () => load(new TextEncoder().encode("this is not a zip").buffer as ArrayBuffer);
$("load-expired").onclick = async () => load(null, await token(Math.floor(Date.now() / 1000) - 60));
$("load-badtoken").onclick = () => load(null, "not.a.jwt");
$("load-twice").onclick = async () => {
  await load(null);
  await load(null);
};
$("snap-auto").onclick = () => snapshot("autosave");
$("snap-submit").onclick = () => snapshot("submit");
$("ro-on").onclick = () => send("SET_READONLY", { readonly: true });
$("ro-off").onclick = () => send("SET_READONLY", { readonly: false });
$("bad-version").onclick = () => send("LOAD_PROJECT", { requestId: nextId() }, [], "2.0");
$("reload").onclick = () => {
  ready = false;
  frame.src = frame.src;
};
