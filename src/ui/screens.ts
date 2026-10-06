import { SOURCE_URL } from "../config";

/** 蓋在編輯器上方的訊息畫面。蓋上時編輯器不可操作（FR-EDT-009：權杖無效時不提供編輯器）。 */
export function showScreen(title: string, body: string) {
  let el = document.getElementById("screen");
  if (!el) {
    el = document.createElement("div");
    el.id = "screen";
    el.setAttribute("role", "alert");
    document.body.appendChild(el);
  }
  el.innerHTML = "";
  const h = document.createElement("h1");
  h.textContent = title;
  const p = document.createElement("p");
  p.textContent = body;
  el.append(h, p);
  el.hidden = false;
}

export function hideScreen() {
  const el = document.getElementById("screen");
  if (el) el.hidden = true;
}

/** FR-EDT-014：介面中常駐本應用原始碼的公開連結（AGPL v3 義務）。 */
export function addSourceLink() {
  const a = document.createElement("a");
  a.id = "source-link";
  a.href = SOURCE_URL;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = "原始碼（AGPL v3）";
  document.body.appendChild(a);
}
