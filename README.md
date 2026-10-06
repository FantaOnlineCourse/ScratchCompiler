# 積木編輯器宿主（Block Editor Host）

線上程式課程平台的 Scratch 積木編輯元件。以 iframe 嵌入主平台，**只做三件事：載入專案、匯出專案、驗證嵌入權杖**。
本倉庫依 [GNU AGPL v3](./LICENSE) 公開原始碼；第三方元件與商標聲明見 [NOTICE.md](./NOTICE.md)。

> 規格來源：`線上課程/specs/A1-editor-host.md`（協定的權威定義）與 `線上課程網站prd/docs/architecture/v2/block-d-editor.md`。

## 架構

```
主平台頁面 (app.*)                         本應用 (editor.*)，不同來源
┌───────────────────────┐   postMessage   ┌─────────────────────────────────┐
│ EditorFrame 元件       │ ⇄──────────────⇄ │ bridge.ts   來源檢查、請求對應    │
│ 自己的 API／資料庫      │                 │ token.ts    ES256 公鑰驗章       │
└───────────────────────┘                 │ editor/     掛上 scratch-gui     │
                                          │ public/gui  上游預建產物（原樣）  │
                                          └─────────────────────────────────┘
```

- **不持有任何東西**：無資料庫、無帳號、無機密、執行時不對外連線。專案內容只經 `postMessage` 進出。
- scratch-gui 使用上游的 **standalone 預建產物**（`@scratch/scratch-gui` 鎖定 15.1.1），由 `scripts/copy-gui.mjs` 原樣複製到 `public/`，不重新打包。本應用自己的程式碼約 30 KB。
- 素材庫檔案由 `scripts/mirror-library-assets.mjs` 建置時下載到 `public/library-assets/`，執行時從本網域取用（FR-EDT-012）。

## 本機開發

```bash
npm install              # postinstall 會複製 scratch-gui 產物到 public/
npm run mirror-assets    # 下載素材庫（約 1,350 個檔案，只需一次）
npm run dev-keys         # 產生本機用 ES256 金鑰對 → .env.local / harness/.env.local
npm run dev              # 編輯器 http://localhost:5173
npm run harness          # 假主平台 http://localhost:5174（另開終端機）
npm test                 # 協定、bridge、權杖的單元測試
```

`.env.local` 還需要 `VITE_ALLOWED_ORIGINS`（見 `.env.example`）。要讓主平台（`Coding/`，port 3000）連上本機編輯器，
主平台的 `EDITOR_TOKEN_PRIVATE_KEY` 必須與這裡的公鑰成對：用主平台的 `node scripts/gen-editor-keys.mjs` 產生，
把印出的公鑰貼到本倉庫 `.env.local` 的 `VITE_TOKEN_PUBLIC_KEY`。

## 設定（全部可公開）

| 變數 | 說明 |
|---|---|
| `VITE_TOKEN_PUBLIC_KEY` | 主平台簽發嵌入權杖的 ES256 公鑰（SPKI PEM，換行寫成 `\n`） |
| `VITE_ALLOWED_ORIGINS` | 允許嵌入的主平台來源，逗號分隔 |
| `VITE_SOURCE_URL` | 本倉庫的公開網址，顯示在介面右下角（AGPL 義務，FR-EDT-014） |

正式環境的 `frame-ancestors` 寫在 `vercel.json`，改網域時兩處要一起改。

## postMessage 協定 v1.0

外層固定 `{ protocolVersion: "1.0", type, payload }`。主版本不同一律拒絕，不做相容。

| 方向 | type | payload |
|---|---|---|
| 主→編 | `LOAD_PROJECT` | `requestId`, `token`, `project_type`（`classwork`/`assignment`）, `project`（`ArrayBuffer` 或 `null`＝空白專案）, `readonly` |
| 主→編 | `REQUEST_SNAPSHOT` | `requestId`, `project_type`, `reason`（`autosave`/`manual`/`submit`） |
| 主→編 | `SET_READONLY` | `readonly` |
| 編→主 | `READY` | `protocolVersion`, `editorVersion` |
| 編→主 | `PROJECT_LOADED` | `requestId`, `project_type` |
| 編→主 | `PROJECT_CHANGED` | `changedAt`（ISO 時間；最多每秒一則） |
| 編→主 | `SNAPSHOT_RESULT` | `requestId`, `project_type`, `ok: true`, `project`（`ArrayBuffer`，Transferable）, `sizeBytes` |
| 編→主 | `ERROR` | `requestId?`, `code`, `message` |

錯誤碼：`INVALID_TOKEN`、`PROTOCOL_MISMATCH`、`INVALID_MESSAGE`、`LOAD_FAILED`、`SNAPSHOT_FAILED`、`EDITOR_CRASHED`。

行為要點：
- 在送出 `READY` 前收到的指令一律忽略；只接受 `ALLOWED_ORIGINS` 內、且來自 `window.parent` 的訊息，回覆只送給該來源。
- 每個 `requestId` 必有回應。`LOAD_PROJECT` 連續送達時以最後一次為準，前一次回 `ERROR`（`LOAD_FAILED`）。
- 權杖只驗簽章、`exp` 與 `aud="editor-host"`，**不讀任何身分欄位**。驗證失敗不載入專案。
- `project_type` 只原樣帶回，本應用不依它做任何判斷。
- `PROJECT_CHANGED` 只在主平台載入專案後、學生於編輯器內實際操作過才送出；唯讀時不送。學生用內建選單「從電腦載入」也會觸發。

## 與上游的差異（刻意的）

| 項目 | 做法 | 原因 |
|---|---|---|
| 離開頁面確認框 | 停用上游的 `window.onbeforeunload` | 在 iframe 內會擋住主平台換頁；存檔由主平台負責 |
| Scratch 標誌、教學按鈕 | CSS 隱藏 | 商標；教學影片來自外部影音平台（FR-EDT-012） |
| 分享、雲端存檔、背包、雲端變數、語言切換 | 以 GUI 屬性關閉 | 不連任何伺服器；介面固定繁體中文 |
| 唯讀模式 | CSS 隱藏編輯區塊＋捕獲階段攔下積木拖曳與刪除鍵（`src/editor/readonly.ts`） | 上游沒有「看得到程式但不能改」的模式 |

## 發布前檢核（每次發布都要做，記錄結果）

**禁止清單**（A1 §1）——以下任一出現在本倉庫即不得發布：商業邏輯／定價／額度、任何個資、學習歷程與回饋內容、金鑰／密碼／API 憑證、主平台資料庫連線或內部 API 位址、主平台的品牌識別與行銷文案。

- [ ] 以禁止清單逐項檢查 `src/`、`scripts/`、`harness/`、設定檔
- [ ] 倉庫掃描無機密（`.env*`、`harness/.env.local` 未進版控）
- [ ] `npm test` 全數通過；`npm run build` 成功
- [ ] harness 手動驗收：載入／變動通知／快照／唯讀／損壞內容／過期與亂碼權杖／連送兩次／主版本不符
- [ ] 快照下載的 `.sb3` 可被 Scratch 官方編輯器開啟
- [ ] DevTools Network 面板無非本網域請求
- [ ] 上游 scratch-gui 安全性更新已評估（30 日內，NFR-EDT-005）
