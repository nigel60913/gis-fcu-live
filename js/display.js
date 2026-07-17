import { db, doc, collection, onSnapshot } from "./firebase-init.js";
import { escapeHtml } from "./utils.js";
import { renderWordCloud, tallyWords } from "./wordcloud.js";

const screen = document.getElementById("screen");
const SESSION_REF = doc(db, "session", "current");

let session = { activeQuestionId: null, state: "idle" };
let question = null;
let responses = [];
let unsubQ = null;
let unsubR = null;
let resizeHandler = null;

onSnapshot(SESSION_REF, (snap) => {
  session = snap.exists() ? snap.data() : { activeQuestionId: null, state: "idle" };
  loadQuestion();
});

function loadQuestion() {
  if (unsubQ) { unsubQ(); unsubQ = null; }
  if (unsubR) { unsubR(); unsubR = null; }
  question = null;
  responses = [];

  if (!session.activeQuestionId) {
    renderIdle();
    return;
  }

  renderLoading();
  unsubQ = onSnapshot(doc(db, "questions", session.activeQuestionId), (qs) => {
    if (!qs.exists()) {
      renderIdle();
      return;
    }
    question = { id: qs.id, ...qs.data() };
    render();
  });
  unsubR = onSnapshot(collection(db, "questions", session.activeQuestionId, "responses"), (snap) => {
    responses = snap.docs.map((d) => d.data());
    render();
  });
}

function getAudienceUrl() {
  return location.origin + location.pathname.replace(/display\.html$/, "index.html");
}

function renderIdle() {
  clearResizeHandler();
  const audienceUrl = getAudienceUrl();
  screen.innerHTML = `
    <div class="idle-wrap">
      <img src="assets/logo.png" alt="GIS.FCU" />
      <h1>掃描 QR Code，加入現場互動</h1>
      <div class="join-grid">
        <div class="qr-card"><div id="joinQr"></div></div>
        <div>
          <p class="muted" style="font-size:20px;">手機免安裝 APP，開啟網頁即可參加</p>
          <div class="join-url">${escapeHtml(audienceUrl)}</div>
        </div>
      </div>
    </div>`;

  if (typeof QRCode !== "undefined") {
    // eslint-disable-next-line no-undef
    new QRCode(document.getElementById("joinQr"), {
      text: audienceUrl,
      width: 210,
      height: 210,
      colorDark: "#005490",
      colorLight: "#ffffff",
    });
  }
}

function renderLoading() {
  clearResizeHandler();
  screen.innerHTML = `
    <div class="hold-wrap">
      <div class="hold-icon">⏳</div>
      <h2>正在載入下一題</h2>
    </div>`;
}

function render() {
  if (!question) return;
  clearResizeHandler();
  screen.innerHTML = `
    <div class="dtop">
      <img class="logo" src="assets/logo.png" alt="GIS.FCU" />
      <div class="dcount">${responses.length} 人已回應</div>
    </div>
    <div class="dmain">
      <div class="eyebrow dq-eyebrow">${escapeHtml(question.part || "")}</div>
      <div class="dq-title">${escapeHtml(question.title)}</div>
      <div class="dresults" id="dresults"></div>
    </div>`;

  const target = document.getElementById("dresults");
  if (session.state === "live") {
    renderHold(target, "📱", "作答進行中", "請在手機上選擇答案，統計結果稍後公布");
    return;
  }
  if (session.state === "locked") {
    renderHold(target, "🔒", "作答已結束", "答案已鎖定，請看主持人公布結果");
    return;
  }
  if (session.state !== "closed") {
    renderHold(target, "⏳", "準備中", "請稍候主持人開始");
    return;
  }

  if (question.type === "wordcloud") renderWC(target);
  else if (question.type === "single" || question.type === "quiz") renderBars(target, false);
  else if (question.type === "multi") renderBars(target, true);
  else if (question.type === "ranking") renderRanking(target);
}

function renderHold(target, icon, title, subtitle) {
  target.innerHTML = `
    <div class="hold-wrap">
      <div class="hold-icon">${icon}</div>
      <h2>${escapeHtml(title)}</h2>
      <p class="muted">${escapeHtml(subtitle)}</p>
    </div>`;
}

function renderWC(target) {
  const allWords = responses.flatMap((r) => (Array.isArray(r.value) ? r.value : [r.value]));
  const words = tallyWords(allWords);
  if (!words.length) {
    target.innerHTML = `<p class="muted" style="text-align:center; font-size:22px;">這題還沒有收到回答</p>`;
    return;
  }

  target.innerHTML = `<canvas id="wcCanvas"></canvas>`;
  const canvas = document.getElementById("wcCanvas");
  const draw = () => renderWordCloud(canvas, words);
  draw();
  resizeHandler = draw;
  window.addEventListener("resize", resizeHandler);
}

function renderBars(target, isMulti) {
  const opts = question.options || [];
  const counts = opts.map(() => 0);
  responses.forEach((r) => {
    if (isMulti && Array.isArray(r.value)) r.value.forEach((i) => { if (counts[i] !== undefined) counts[i]++; });
    else if (!isMulti && typeof r.value === "number" && counts[r.value] !== undefined) counts[r.value]++;
  });
  const max = Math.max(1, ...counts);
  const letters = "ABCDEFGH";

  if (!opts.length) {
    target.innerHTML = `<p class="muted">此題尚未設定選項</p>`;
    return;
  }

  const barsHtml = opts.map((opt, i) => {
    const isCorrect = question.type === "quiz" && i === question.correctIndex;
    return `
      <div class="big-bar-row ${isCorrect ? "correct" : ""}">
        <div class="lab"><span>${letters[i] || i + 1}. ${escapeHtml(opt)}</span><span>${counts[i]}</span></div>
        <div class="big-bar-track"><div class="big-bar-fill" style="width:${(counts[i] / max) * 100}%"></div></div>
      </div>`;
  }).join("");

  const buzzerHtml = question.type === "quiz" ? renderBuzzerBoard() : "";
  target.innerHTML = buzzerHtml + barsHtml;
}

function renderBuzzerBoard() {
  const correct = responses
    .filter((r) => r.value === question.correctIndex && r.createdAt)
    .sort((a, b) => (a.createdAt.seconds ?? 0) - (b.createdAt.seconds ?? 0) || (a.createdAt.nanoseconds ?? 0) - (b.createdAt.nanoseconds ?? 0))
    .slice(0, 5);

  if (!correct.length) {
    return `<div class="buzzer-board"><div class="buzzer-title">⚡ 搶答排行榜</div><p class="muted" style="font-size:20px;">這題沒有人答對～</p></div>`;
  }

  const medalCls = ["gold", "silver", "bronze"];
  const medalIcon = ["🥇", "🥈", "🥉"];
  const rows = correct.map((r, i) => `
    <div class="buzzer-row ${medalCls[i] || ""}">
      <div class="buzzer-rank">${medalIcon[i] || i + 1}</div>
      <div class="buzzer-name">${escapeHtml(r.nickname || "匿名")}</div>
      <div class="buzzer-time">${i === 0 ? "最快答對！" : `第 ${i + 1} 快`}</div>
    </div>`).join("");

  return `<div class="buzzer-board"><div class="buzzer-title">⚡ 搶答排行榜</div>${rows}</div>`;
}

function renderRanking(target) {
  const opts = question.options || [];
  const n = opts.length;
  const scores = opts.map(() => 0);
  responses.forEach((r) => {
    if (!Array.isArray(r.value)) return;
    r.value.forEach((optIdx, pos) => {
      if (scores[optIdx] !== undefined) scores[optIdx] += (n - pos);
    });
  });
  const order = opts.map((opt, i) => ({ opt, i, score: scores[i] })).sort((a, b) => b.score - a.score);
  const max = Math.max(1, ...scores);
  const medals = ["🥇", "🥈", "🥉"];

  const barsHtml = order.map((o, rank) => `
    <div class="big-bar-row">
      <div class="lab"><span><span class="rank-medal">${medals[rank] || (rank + 1 + ".")}</span>${escapeHtml(o.opt)}</span><span>${o.score} 分</span></div>
      <div class="big-bar-track"><div class="big-bar-fill" style="width:${(o.score / max) * 100}%"></div></div>
    </div>`).join("");

  target.innerHTML = barsHtml + `<div class="rank-sub">共 ${responses.length} 人完成排序 · 第一名得 ${n} 分，依序遞減</div>`;
}

function clearResizeHandler() {
  if (!resizeHandler) return;
  window.removeEventListener("resize", resizeHandler);
  resizeHandler = null;
}
