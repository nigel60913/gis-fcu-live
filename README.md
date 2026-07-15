# GIS.FCU Live｜現場互動問答系統

給約 60 人現場活動用的輕量版 Mentimeter / Slido：主持人後台編輯題目、控制流程；
觀眾掃 QR code 用手機作答（文字雲／單選／複選／排名／猜答案搶答）；
結果即時投影在大螢幕。純前端 + Firebase，免後端主機、免費額度內可用。

三個頁面：

| 頁面 | 用途 | 誰用 |
|---|---|---|
| `admin.html` | 建題目、控制現在進行到第幾題、公布結果 | 主持人（你），需要 Google 登入 |
| `index.html` | 作答頁 | 觀眾手機掃 QR code |
| `display.html` | 即時結果（文字雲／長條圖／排名） | 投影機 / 大螢幕 |

---

## 1. 建立 Firebase 專案

1. 到 [Firebase 主控台](https://console.firebase.google.com/)，建立新專案（例如 `gis-fcu-live`）。
2. 左側選單「建構」→ **Firestore Database** → 建立資料庫 → 選「正式環境」模式、地區選 `asia-east1`（台灣近）。
3. 左側選單「建構」→ **Authentication** → 開始使用 → 登入方式選 **Google** → 啟用。
4. 左側「專案設定」（齒輪圖示）→ 一般 → 拉到最下面「你的應用程式」→ 點網頁圖示 `</>` 新增一個 Web App（名稱隨意，不用勾 Hosting）。
5. 複製出現的 `firebaseConfig` 物件。

## 2. 填入專案設定

打開 `js/firebase-config.js`，把剛剛複製的值貼上：

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
};

export const ADMIN_EMAILS = [
  "你的Gmail帳號@gmail.com",   // 只有這些帳號能登入後台
];
```

## 3. 設定 Firestore 安全規則

Firebase 主控台 → Firestore Database → 規則，把 `firestore.rules` 的內容整份貼上並「發布」。

## 4. 建立第一筆 session 資料（一次性）

Firestore Database → 資料 → 開始收集 → Collection ID 輸入 `session`
→ 文件 ID 輸入 `current` → 新增兩個欄位：
- `activeQuestionId`（string，留空）
- `state`（string，填 `idle`）

（如果忘記做這步，第一次打開 admin.html 登入後系統也會自動幫你補上。）

## 5. 本機測試

因為用了 ES module（`type="module"`），不能直接用 `file://` 打開，需要一個本地伺服器：

```bash
cd gis-fcu-live
python3 -m http.server 8080
# 打開 http://localhost:8080/admin.html
```

## 6. 部署到 GitHub Pages

```bash
cd gis-fcu-live
git init
git add .
git commit -m "GIS.FCU Live"
git branch -M main
git remote add origin https://github.com/你的帳號/gis-fcu-live.git
git push -u origin main
```

GitHub Repo → Settings → Pages → Source 選 `main` branch、`/ (root)` → Save。
幾分鐘後網站會出現在 `https://你的帳號.github.io/gis-fcu-live/`。

> ⚠️ 注意：`firebase-config.js` 裡的 `apiKey` 會一起被公開在 GitHub 上，這是 Firebase Web SDK
> 的正常設計（它不是密鑰），真正的保護是靠第 3 步的 Firestore 安全規則，
> 所以務必確認規則已經發布、且 `ADMIN_EMAILS` 只列出你信任的帳號。
> 如果不想公開 repo，把它設成 GitHub 的 **Private** repo，Pages 一樣可以在 Private repo 上開啟（需 Pro 帳號或組織方案；
> 個人免費帳號的 Private repo 無法用 Pages，這種情況建議改用 Firebase Hosting，見下方「替代方案」）。

## 7. 活動當天操作流程

1. 用電腦打開 `admin.html`，用授權的 Google 帳號登入。
2. 點「載入範本題庫」，會依你原本的活動企劃文件把 Part 2（全員互動）、Part 3（ESG 共創）、
   Part 4（Closing）的題目都建好——**記得把猜答案題的選項改成真實數字/答案**。
3. 把「大螢幕投影頁」連結在投影機瀏覽器打開（`display.html`），全螢幕顯示。
4. 把「現場連結」的 QR code 秀在螢幕上（或印在座位卡上），讓觀眾掃碼進 `index.html`。
5. 活動進行時，在後台點「下一題／上一題」切換題目，觀眾手機畫面會自動同步；
   投票／文字雲會即時長出來。
6. 猜答案題想要「先讓大家猜、再公布正確答案」時，先讓大家作答，時間到按「公布結果」，
   投影頁會亮出正確選項；想重來一次按「重新開放作答」。

## 8. 之後要修改題目/選項

回到 `admin.html`，點題目卡片的 ✎ 編輯，或 ⧉ 複製一份修改，或建立全新題目，都是即時生效，
不需要重新部署網站。

---

## 替代方案：改用 Firebase Hosting（不想用 GitHub Pages 時）

```bash
npm install -g firebase-tools
firebase login
cd gis-fcu-live
firebase init hosting   # public 目錄選「.」（目前資料夾）
firebase deploy
```

---

## 檔案結構

```
gis-fcu-live/
├── admin.html          # 主持人後台
├── index.html          # 觀眾作答頁
├── display.html        # 大螢幕投影頁
├── firestore.rules     # Firestore 安全規則
├── css/style.css        # 共用視覺樣式（色彩／字體／元件）
├── js/
│   ├── firebase-config.js   # ← 你要填入自己的 Firebase 專案金鑰
│   ├── firebase-init.js
│   ├── admin.js
│   ├── audience.js
│   ├── display.js
│   ├── wordcloud.js         # 純前端文字雲渲染
│   ├── seed-questions.js    # 範本題庫（依活動企劃文件整理）
│   └── utils.js
└── assets/logo.png     # GIS.FCU 標誌（已去背）
```

## 支援的題型

| 題型 | 說明 | 顯示方式 |
|---|---|---|
| 文字雲 | 開放式文字作答 | 即時文字雲，字愈大表示愈多人填一樣的答案 |
| 單選投票 | 一人限選一項 | 長條圖 |
| 複選投票 | 一人可選多項 | 長條圖 |
| 排名 | 依偏好排序所有選項 | 依 Borda 計分排序的長條圖，前三名有 🥇🥈🥉 |
| 猜答案搶答 | 單選，可設正確答案 | 長條圖，公布結果後正確選項變綠色 |
