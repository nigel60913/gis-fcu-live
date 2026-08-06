# GitHub Pages 上傳方式

此版本只使用一個投影網址：`display.html`。
後台按下「抽獎」後，只會把 Firebase session 狀態改成 `lottery`，已開啟的 `display.html` 會原頁切換成完整抽獎介面，不會另開 `lottery.html`。

## 最穩定上傳方式

1. 到 GitHub 專案 `nigel60913/gis-fcu-live`。
2. 進入 **Code** 頁籤，刪除舊檔後，把本 ZIP 解壓縮後的「所有檔案」上傳到儲存庫最外層；不要再包一層資料夾。
3. 確認最外層可直接看到 `display.html`、`admin.html`、`index.html`、`css`、`js`、`.github`。
4. Commit 到 `main`。
5. 到 **Settings → Pages → Build and deployment → Source**，選擇 **GitHub Actions**。
6. 到 **Actions**，等待 `Deploy GitHub Pages` 完成。
7. 開啟 `https://nigel60913.github.io/gis-fcu-live/display.html?v=2110` 強制避開舊快取。

## 驗證

- 投影電腦只開 `display.html`。
- 主持後台按「抽獎」。
- `display.html` 應直接切換到抽獎畫面，網址不變。
- 主持後台按「回到等待大廳」，同一個 `display.html` 應切回等待畫面。
