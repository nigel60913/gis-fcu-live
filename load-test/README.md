# JMeter 150 人壓力測試

此測試模擬 **150 位觀眾**在 30 秒內進場。每位虛擬使用者會載入觀眾頁、讀取
`session/current`、讀取目前題目，再以唯一的 `clientId` 寫入一份答案。送出答案若超過
3 秒即判定失敗。

## 最簡單：使用 GitHub Actions 一鍵測試

不需安裝任何軟體：

1. 在主持人後台開始一題「單選題」，並保持題目開放。
2. 前往 GitHub 專案的 **Actions** 頁籤。
3. 左側點選 **150 人一鍵壓力測試**。
4. 點右側 **Run workflow**；一般測試維持 `30` 秒，再按綠色 **Run workflow**。
5. 等待綠色勾勾。點進執行結果即可看到摘要，頁面底部的
   `jmeter-150-users-report` 可下載完整 HTML 報告。

一鍵測試固定使用 150 人且只執行一輪。它會先確認網站、Firebase、活動狀態及題型，
任何條件不符都會在寫入前停止。請勿在正式活動或未經授權的專案執行。

## 建議：先用 Firebase Emulator

1. 啟動網站：`python3 -m http.server 8000`
2. 使用專案既有設定啟動 Firestore Emulator，並建立 `session/current`、一筆作用中的題目，
   且將 `activeQuestionId` 指向該題目。
3. 安裝 Apache JMeter 5.6 以上後執行：

```bash
./load-test/run-150-users.sh
```

HTML 報表會輸出至 `load-test/results/<UTC 時間>/report/index.html`。主要驗收指標為：

- `Error %` 必須為 0%；
- `04 - Submit unique response` 的 95th percentile 建議低於 3 秒；
- 實際活動前應監控 Firestore 使用量、配額、瀏覽器錯誤及網路頻寬。

## 測試正式環境

正式 Firestore REST API 需使用 HTTPS，並將 Web API key 以前導 `?key=` 傳入：

```bash
APP_BASE_URL=https://your-site.example \
FIRESTORE_BASE_URL=https://firestore.googleapis.com \
PROJECT_ID=your-firebase-project \
API_KEY_QUERY='?key=your-web-api-key' \
./load-test/run-150-users.sh
```

> **注意：** 測試會真的新增 `questions/{questionId}/responses/loadtest_*` 文件，產生
> Firestore 讀寫費用，且可能影響投影頁票數。請只在測試題目／測試專案執行，完成後由
> 已登入的管理員清除答案。不要從開發者個人電腦直接對正式環境進行未經授權的壓測。

可透過環境變數調整 `USERS`、`RAMP_SECONDS`、`LOOPS`、`THINK_TIME_MS` 與
`RESULT_DIR`。若要驗證「同一瞬間」的尖峰，可縮短 `RAMP_SECONDS`，但應先取得服務維運者
同意並逐級從 25、50、100 提升到 150 人。
