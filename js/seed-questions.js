// 依活動企劃文件預先整理的題庫範本
// 進到後台後可以點「載入範本題庫」一次匯入，之後再自由編輯／刪除／調整順序
export const SEED_QUESTIONS = [
  {
    part: "全員互動",
    type: "wordcloud",
    title: "你最有成就感的一件工作？",
    options: [],
  },
  {
    part: "全員互動",
    type: "single",
    title: "今年哪個公司活動你最喜歡？",
    options: ["尾牙", "教育訓練", "團隊出遊", "運動會", "其他（請依實際活動修改）"],
  },
  {
    part: "全員互動",
    type: "single",
    title: "哪個福利最有感？",
    options: ["彈性上下班", "教育訓練補助", "健康檢查", "旅遊補助", "其他（請依實際福利修改）"],
  },
  {
    part: "全員互動",
    type: "wordcloud",
    title: "如果公司只能新增一項福利，你希望是？",
    options: [],
  },
  {
    part: "全員互動",
    type: "multi",
    title: "今年你最想學什麼？（可複選）",
    options: ["AI", "簡報", "英文", "PM", "GIS", "溝通", "領導", "其他"],
  },
  {
    part: "全員互動",
    type: "wordcloud",
    title: "你認為公司最大的特色是？",
    options: [],
  },
  {
    part: "ESG 共創",
    type: "ranking",
    title: "我希望公司未來多做哪些 ESG 活動？（請排出你最想參加的順序）",
    options: ["家庭日", "志工", "淨灘", "植樹", "捐血", "講座", "減塑", "健康促進", "運動社團", "永續市集"],
  },
  {
    part: "ESG 共創",
    type: "multi",
    title: "你願意投入哪一類 ESG 活動？（可複選，建立志工資料庫）",
    options: ["活動志工", "攝影", "主持", "企劃", "公益", "永續", "教育", "社群", "行政"],
  },
  {
    part: "ESG 共創",
    type: "wordcloud",
    title: "我期待公司的 ESG 是____。",
    options: [],
  },
  {
    part: "Closing",
    type: "quiz",
    title: "猜猜看：今年公司服務了幾個客戶？（請依實際數字修改選項）",
    options: ["10 個以下", "10–30 個", "30–50 個", "50 個以上"],
    correctIndex: 1,
  },
  {
    part: "Closing",
    type: "quiz",
    title: "你不知道的公司：GIS.FCU 是哪一年成立的？（請依實際年份修改選項）",
    options: ["2000 年", "2005 年", "2010 年", "2015 年"],
    correctIndex: 0,
  },
  {
    part: "Closing",
    type: "single",
    title: "同事大調查：今年你有用過 AI 工具嗎？",
    options: ["有，常常用", "有，用過幾次", "還沒用過"],
  },
];
