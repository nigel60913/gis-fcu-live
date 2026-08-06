# GitHub Pages 部署修正

本版本新增 `.github/workflows/pages.yml`，讓網站發布工作使用同一個 `pages` concurrency 群組。
後續更新會在 GitHub Actions 層取消同群組的舊執行，只保留最新部署，不會同時向 GitHub Pages 建立兩個部署。

## 第一次使用前必做一次

目前錯誤訊息中的舊部署：

`1c1aaee8884453bffc5be516dc174933de8e8c4a`

已經在 GitHub 端處於進行中，這不是網站程式檔案本身能直接取消的工作。

1. 進入 Repository → **Actions**。
2. 找到仍在執行或排隊的舊 Pages workflow，按 **Cancel workflow**。
3. 到 Repository → **Settings** → **Pages**。
4. 在 **Build and deployment / Source** 選擇 **GitHub Actions**。
5. 回到 **Actions**，執行最新的 **Deploy GitHub Pages**，或重新推送一次 main。

## 注意

- 不要同時保留另一個自訂 Pages 部署 workflow。
- `load-test-150.yml` 只會手動執行，不會自動部署網站。
- Pages artifact 由 `_site` 暫存目錄產生，只包含 HTML、`assets/`、`css/`、`js/` 與 `.nojekyll`，不會上傳 `.git`、壓測結果、Excel 或開發文件。
- `punycode` 是 GitHub Action 依賴套件的棄用警告，與網站內容無關。
