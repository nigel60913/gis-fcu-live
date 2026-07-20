# ESG × MM Live v2.0

一套以 Firebase Firestore 即時同步的現場互動系統，提供手機作答、主持控制與大螢幕即時結果。v2.0 完整重構視覺與操作流程，但保留既有資料契約。

## 三個入口

- `index.html`：Audience 手機作答
- `admin.html`：主持人控制台（Google 登入）
- `display.html`：活動投影畫面

## v2.0 功能

- ESG × MM 品牌設計、Liquid Glass、響應式版面與 CSS 動畫
- 單選、複選、選擇題、開放文字、文字雲、Emoji、1–5 評分、Slider、Yes / No、排序
- 主持控制：開始、停止、公布、下一題、清空答案、15/30/60 秒自動關閉、抽獎
- 即時票數、回答率、在線數估算、投票進度、QR Code
- Loading、Skeleton、空狀態、錯誤、Toast、離線與重新連線提示
- 長條圖、文字雲、平均分數與數字動畫

## Firestore 相容性

既有 collection、document 路徑與 response 格式保持不變：

```text
session/current
questions/{questionId}
questions/{questionId}/responses/{clientId}
```

回答仍使用 `value`、`clientId`、`nickname`、`createdAt`；題目仍使用 `part`、`type`、`title`、`options`、`correctIndex`、`order`、`createdAt`。v2 題型只在既有 `type` 字串與題目欄位上向後相容擴充。

## 本機執行

```bash
python -m http.server 8080
```

開啟 `http://localhost:8080/admin.html`。Firebase 設定沿用 `js/firebase-config.js`。

## 程式結構

```text
css/v2.css          共用設計系統與響應式樣式
js/firebase.js      Firebase 模組入口
js/ui.js            Toast、網路狀態與錯誤 UI
js/timer.js         主持倒數計時器
js/admin.js         主持控制與題庫
js/audience.js      觀眾作答流程
js/display.js       投影結果與動畫
js/utils.js         共用工具
```


## 2.6.0 修正版
- 新增 audience.html 相容入口
- 主持權限改由 Firestore Rules 限制
- 投票截止後禁止送出，且每個裝置每題僅能回答一次
- 倒數重新整理後可恢復
- 排序題支援手機上下調整
- 抽獎結果保存於 session，不會因重新整理而更換
- 刪除題目時同步清除回答資料
