# 著作權與授權聲明

本應用（積木編輯器宿主）依 **GNU Affero General Public License v3.0** 授權，全文見 [LICENSE](./LICENSE)。

## 內含的第三方元件

| 元件 | 版本 | 授權 | 著作權人 |
|---|---|---|---|
| @scratch/scratch-gui（含 scratch-vm、scratch-render 等，以預建產物形式隨附於 `public/gui`、`public/chunks`、`public/static`） | 15.1.1 | AGPL-3.0-only | Scratch Foundation |
| scratch-blocks（打包於 scratch-gui 內） | 隨 scratch-gui | Apache-2.0 | Massachusetts Institute of Technology / Google |
| jose | 見 package-lock.json | MIT | Filip Skokan |

scratch-gui 預建產物內含的其他相依套件授權聲明，隨附於 `public/gui/scratch-gui-standalone.js.LICENSE.txt`。
完整相依套件授權清單須於上線前產生並留存（block-d-editor.md「開源授權義務對照」）。

## 素材庫

`public/library-assets/` 中的角色、造型、背景與音效由 `scripts/mirror-library-assets.mjs` 於建置時自 Scratch 官方素材伺服器鏡像，未納入版控。

## 商標

Scratch 名稱、標誌、Scratch Cat 等圖樣為 Scratch Foundation 的商標（見上游 TRADEMARK 檔）。
本應用與 Scratch Foundation 無任何關聯，亦未獲其背書；介面中不顯示 Scratch 標誌。
