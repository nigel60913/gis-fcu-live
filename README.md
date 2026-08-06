# ESG × MM Live v2.0

一套以 Firebase Firestore 即時同步的現場互動系統，提供手機作答、主持控制與大螢幕即時結果。v2.0 完整重構視覺與操作流程，但保留既有資料契約。

## 三個入口

- `index.html`：Audience 手機作答
- `admin.html`：主持人控制台（Google 登入）
- `display.html`：活動投影畫面

## v2.0 功能

- ESG × MM 品牌設計、Liquid Glass、響應式版面與 CSS 動畫
- 單選、複選、選擇題、開放文字、文字雲、Emoji、1–5 評分、Slider、Yes / No、排序
- 主持控制：開始、停止、公布、下一題、清空答案、10/30/60 秒自動關閉、抽獎
- 即時票數、回答率、在線數估算、投票進度、QR Code
- Loading、Skeleton、空狀態、錯誤、Toast、離線與重新連線提示
- 長條圖、文字雲、平均分數與數字動畫

## v2.7 功能調整

- 文字雲／開放文字題可設定每份答案的字數上限，手機作答頁同步顯示字數。
- 多選題可設定最多選擇項數，超過上限時會阻止勾選並提示。
- 主持控制台題庫支援拖曳排序，排序結果會寫回 Firestore。
- 投影頁加入專用版面樣式，修正 Logo、標題、QR Code 與倒數計時的比例。
- 主持人可先選擇 10／30／60 秒或輸入自訂秒數，再按「開始投票」同步啟動倒數。
- 新增或編輯題目時可設定該題的預設倒數秒數，選取題目後會自動套用。

若正式環境已部署 Firebase，更新網站檔案後也請同步部署
`firestore.rules`，讓字數與多選上限同時受到資料庫規則保護。

## v2.8 Display 大廳與活動音效

- 「回到等待大廳」會停用題目頁專用樣式，完整恢復原版 ESG 等待大廳。
- Display 右下角新增音效開關；首次須由使用者點擊「開啟音效」。
- 音效會依等待大廳、題目前等待、答題倒數、截止待公布、結果及抽獎自動切換。
- 大廳、倒數、等待公布及抽獎音效由瀏覽器即時合成，不依賴第三方串流。
- 公布答案後的講解階段改用專案內建 MP3，網頁部署後可直接播放。

## v2.8.3 公布答案配樂與音量增強

- Display 整體音源與主輸出音量再次提高。
- 公布答案／結果後持續循環播放輕快背景音樂。
- 保留壓縮與限幅保護，降低高音量時爆音的機率。

## v2.9.0 公布答案 MP3 背景音樂

- 公布答案時先播放揭曉提示音，再淡入真正的 MP3 背景音樂。
- 答案講解期間持續循環，切換下一題或回到等待大廳時自動淡出並停止。
- Display 原有的音效開關及 0–100% 音量滑桿會同步控制 MP3。

## v2.9.3 Display 分類與背景音樂

- 保留原有 E、S、G 圖示卡片樣式，新增 M Media／數位媒體與 M Marketing／行銷宣傳。
- 回到等待大廳時改播較明亮、輕快的 MP3 背景音樂。
- 答案講解背景音樂提高節奏並降低音量，避免影響主持人說明。

## v2.8.2 Display 音量增強

- 提升 Display 合成音效輸出，100% 約為前版 3.4 倍增益。
- 加入動態壓縮／限幅保護，降低高音量時的爆音與失真。
- 音量滑桿仍維持 0–100%，並保留上次設定。

## v2.8.1 Display 音量控制

- Display 右下角新增 0–100% 音量滑桿及即時百分比。
- 音量設定會保存在目前瀏覽器，重新整理 Display 後仍會沿用。
- 音量調整只作用於投影頁，不影響主持控制台及觀眾手機。

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

## 150 人壓力測試

專案提供 JMeter 測試計畫，模擬 150 位觀眾載入頁面、讀取場次與題目，並同時送出答案。
執行方式、Firebase Emulator 設定、正式環境注意事項及驗收指標請見
[`load-test/README.md`](load-test/README.md)。
不想安裝 JMeter 時，可直接到 GitHub 專案的 **Actions** 頁籤執行
「150 人一鍵壓力測試」。

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

## 集團福利點數抽獎頁

- 主持控制台點選「投影抽獎頁」後，抽獎畫面會直接同步顯示在既有的 `display.html`，不會另開視窗。
- Display 會從目前題目的有效回答者中隨機顯示一位幸運得主。
- Display 抽獎畫面會播放與答案公布相同的背景音樂（需先在投影頁開啟音效）。
- 主持人可用「回到等待大廳」或其他題目控制，讓投影離開抽獎畫面。

- 重新部署 GitHub Pages
