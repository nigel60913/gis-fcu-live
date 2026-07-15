import { db, doc, collection, onSnapshot } from "./firebase-init.js";
import { escapeHtml } from "./utils.js";
import { renderWordCloud, tallyWords } from "./wordcloud.js";

const screen = document.getElementById("screen");
const SESSION_REF = doc(db, "session", "current");

let session = { activeQuestionId: null, state: "idle" };
let question = null;
let responses = [];
let unsubQ = null, unsubR = null;
let resizeHandler = null;

onSnapshot(SESSION_REF, (snap) => {
  session = snap.exists() ? snap.data() : { activeQuestionId: null, state: "idle" };
  loadQuestion();
});

function loadQuestion() {
  if (unsubQ) { unsubQ(); unsubQ = null; }
  if (unsubR) { unsubR(); unsubR = null; }

  if (!session.activeQuestionId) {
    question = null; responses = [];
    renderIdle();
    return;
  }
  unsubQ = onSnapshot(doc(db, "questions", session.activeQuestionId), (qs) => {
    if (!qs.exists()) return;
    question = { id: qs.id, ...qs.data() };
    render();
  });
  unsubR = onSnapshot(collection(db, "questions", session.activeQuestionId, "responses"), (snap) => {
    responses = snap.docs.map((d) => d.data());
    render();
  });
}

function renderIdle() {
  if (resizeHandler) { window.removeEventListener("resize", resizeHandler); resizeHandler = null; }
  screen.innerHTML = `
    <div class="idle-wrap">
      <img src="assets/logo.png" alt="GIS.FCU" />
      <h1>準備好了嗎？</h1>
      <p class="muted" style="font-size:18px; margin-top:8px;">請掃描 QR code 加入現場互動</p>
    </div>`;
}

function render() {
  if (!question) return;
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
  if (question.type === "wordcloud") renderWC(target);
  else if (question.type === "single" || question.type === "quiz") renderBars(target, false);
  else if (question.type === "multi") renderBars(target, true);
  else if (question.type === "ranking") renderRanking(target);
}

function renderWC(target) {
  target.innerHTML = `<canvas id="wcCanvas"></canvas>`;
  const canvas = document.getElementById("wcCanvas");
  const words = tallyWords(responses.map((r) => r.value));
  const draw = () => renderWordCloud(canvas, words);
  draw();
  if (resizeHandler) window.removeEventListener("resize", resizeHandler);
  resizeHandler = () => draw();
  window.addEventListener("resize", resizeHandler);
  if (!words.length) {
    target.innerHTML = `<p class="muted" style="text-align:center; font-size:20px;">還沒有人回答，等你的答案出現在這裡～</p>`;
  }
}

function renderBars(target, isMulti) {
  const opts = question.options || [];
  const counts = opts.map(() => 0);
  responses.forEach((r) => {
    if (isMulti && Array.isArray(r.value)) r.value.forEach((i) => { if (counts[i] !== undefined) counts[i]++; });
    else if (!isMulti && typeof r.value === "number") { if (counts[r.value] !== undefined) counts[r.value]++; }
  });
  const max = Math.max(1, ...counts);
  const revealed = session.state === "closed";
  const letters = "ABCDEFGH";

  if (!opts.length) { target.innerHTML = `<p class="muted">此題尚未設定選項</p>`; return; }

  target.innerHTML = opts
    .map((opt, i) => {
      const isCorrect = question.type === "quiz" && revealed && i === question.correctIndex;
      return `
      <div class="big-bar-row ${isCorrect ? "correct" : ""}">
        <div class="lab"><span>${letters[i] || i + 1}. ${escapeHtml(opt)}</span><span>${counts[i]}</span></div>
        <div class="big-bar-track"><div class="big-bar-fill" style="width:${(counts[i] / max) * 100}%"></div></div>
      </div>`;
    })
    .join("");
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

  target.innerHTML = order
    .map((o, rank) => `
      <div class="big-bar-row">
        <div class="lab"><span><span class="rank-medal">${medals[rank] || rank + 1 + "."}</span>${escapeHtml(o.opt)}</span><span>${o.score}</span></div>
        <div class="big-bar-track"><div class="big-bar-fill" style="width:${(o.score / max) * 100}%"></div></div>
      </div>`)
    .join("");
}
