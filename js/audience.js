import {
  db, collection, doc, getDoc, setDoc, onSnapshot, serverTimestamp,
} from "./firebase-init.js";
import { getClientId, showToast, escapeHtml } from "./utils.js";

const clientId = getClientId();
const stage = document.getElementById("stage");
const stateTag = document.getElementById("stateTag");
const SESSION_REF = doc(db, "session", "current");

let session = { activeQuestionId: null, state: "idle" };
let currentQuestion = null;
let myResponse = null;      // 目前這題我送出的值
let unsubQuestion = null;

onSnapshot(SESSION_REF, async (snap) => {
  session = snap.exists() ? snap.data() : { activeQuestionId: null, state: "idle" };
  await loadActiveQuestion();
});

async function loadActiveQuestion() {
  if (unsubQuestion) { unsubQuestion(); unsubQuestion = null; }

  if (!session.activeQuestionId) {
    currentQuestion = null;
    myResponse = null;
    renderWaiting();
    return;
  }

  const qRef = doc(db, "questions", session.activeQuestionId);
  unsubQuestion = onSnapshot(qRef, async (qs) => {
    if (!qs.exists()) return;
    currentQuestion = { id: qs.id, ...qs.data() };
    await fetchMyResponse();
    render();
  });
}

async function fetchMyResponse() {
  try {
    const rRef = doc(db, "questions", currentQuestion.id, "responses", clientId);
    const rs = await getDoc(rRef);
    myResponse = rs.exists() ? rs.data().value : null;
  } catch {
    myResponse = null;
  }
}

function renderWaiting() {
  stateTag.textContent = "等待主持人開始";
  stage.innerHTML = `
    <div class="card empty-state" style="margin-top:40px;">
      <div class="icon">👋</div>
      <h3 style="font-size:18px; margin-bottom:8px;">歡迎加入現場互動</h3>
      <p class="muted">主持人準備好下一題時，畫面會自動跳出，請稍候～</p>
    </div>`;
}

function render() {
  const locked = session.state === "closed";
  stateTag.textContent = locked ? "已公布結果" : "作答中";
  stateTag.className = "pill" + (locked ? "" : " live");

  const q = currentQuestion;
  let body = "";
  if (q.type === "wordcloud") body = renderWordcloudForm(q, locked);
  else if (q.type === "single" || q.type === "quiz") body = renderChoiceForm(q, locked, false);
  else if (q.type === "multi") body = renderChoiceForm(q, locked, true);
  else if (q.type === "ranking") body = renderRankingForm(q, locked);

  stage.innerHTML = `
    <div class="card">
      <div class="eyebrow">${escapeHtml(q.part || "")}</div>
      <h2 style="font-size:20px; margin-top:12px; line-height:1.5;">${escapeHtml(q.title)}</h2>
      <div style="margin-top:20px;">${body}</div>
    </div>`;

  wireForm(q, locked);
}

// ---------- Word cloud ----------
function renderWordcloudForm(q, locked) {
  const val = typeof myResponse === "string" ? myResponse : "";
  if (locked) {
    return `<p class="muted">已公布文字雲，請看大螢幕。${val ? `你送出的是：「${escapeHtml(val)}」` : ""}</p>`;
  }
  return `
    <textarea id="wcInput" rows="2" maxlength="24" placeholder="輸入一個詞或短句…">${escapeHtml(val)}</textarea>
    <p class="muted" style="margin-top:6px;">最多 24 字，越簡短越適合文字雲</p>
    <button id="submitBtn" class="btn btn-primary btn-block" style="margin-top:16px;">${val ? "更新答案" : "送出"}</button>`;
}

// ---------- Single / Multi / Quiz ----------
function renderChoiceForm(q, locked, isMulti) {
  const selected = isMulti
    ? Array.isArray(myResponse) ? myResponse : []
    : typeof myResponse === "number" ? [myResponse] : [];
  const letters = "ABCDEFGH";

  const options = (q.options || [])
    .map((opt, i) => {
      let cls = "opt-btn";
      if (selected.includes(i)) cls += " selected";
      if (locked && q.type === "quiz") {
        if (i === q.correctIndex) cls += " correct";
        else if (selected.includes(i)) cls += " wrong";
      }
      return `<button type="button" class="${cls}" data-idx="${i}" ${locked ? "disabled" : ""}>
        <span class="opt-letter">${letters[i] || i + 1}</span>
        <span>${escapeHtml(opt)}</span>
      </button>`;
    })
    .join("");

  const submitBtn = isMulti && !locked
    ? `<button id="submitBtn" class="btn btn-primary btn-block" style="margin-top:14px;">送出</button>`
    : "";

  const hint = locked
    ? q.type === "quiz"
      ? selected.includes(q.correctIndex) ? "🎉 你答對了！" : "答案已公布，看看正確答案吧"
      : "已公布結果，請看大螢幕"
    : isMulti
    ? "可複選，選好後按送出"
    : "點選其中一項即送出";

  return `<div class="row wrap" style="flex-direction:column; gap:10px;">${options}</div>
    ${submitBtn}
    <p class="muted" style="margin-top:12px;">${hint}</p>`;
}

// ---------- Ranking ----------
let rankState = [];
function renderRankingForm(q, locked) {
  rankState = Array.isArray(myResponse) ? [...myResponse] : [];
  const items = (q.options || [])
    .map((opt, i) => {
      const pos = rankState.indexOf(i);
      return `<div class="rank-item ${pos >= 0 ? "picked" : ""}" data-idx="${i}">
        <div class="rank-badge">${pos >= 0 ? pos + 1 : ""}</div>
        <div>${escapeHtml(opt)}</div>
      </div>`;
    })
    .join("");
  return `
    <p class="muted" style="margin-bottom:12px;">依序點選，從你最想要的開始排序</p>
    <div id="rankList">${items}</div>
    ${
      locked
        ? '<p class="muted">已公布排名，請看大螢幕</p>'
        : `<button id="submitBtn" class="btn btn-primary btn-block" style="margin-top:6px;" ${rankState.length === (q.options || []).length ? "" : "disabled"}>送出排名</button>`
    }`;
}

// ---------- Wiring ----------
function wireForm(q, locked) {
  if (locked) return;

  if (q.type === "wordcloud") {
    document.getElementById("submitBtn")?.addEventListener("click", async () => {
      const text = document.getElementById("wcInput").value.trim();
      if (!text) return showToast("請輸入內容");
      await submitResponse(text);
    });
    return;
  }

  if (q.type === "single" || q.type === "quiz") {
    stage.querySelectorAll(".opt-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await submitResponse(+btn.dataset.idx);
      });
    });
    return;
  }

  if (q.type === "multi") {
    const selected = new Set(Array.isArray(myResponse) ? myResponse : []);
    stage.querySelectorAll(".opt-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = +btn.dataset.idx;
        if (selected.has(idx)) { selected.delete(idx); btn.classList.remove("selected"); }
        else { selected.add(idx); btn.classList.add("selected"); }
      });
    });
    document.getElementById("submitBtn")?.addEventListener("click", async () => {
      if (!selected.size) return showToast("請至少選一項");
      await submitResponse([...selected].sort((a, b) => a - b));
    });
    return;
  }

  if (q.type === "ranking") {
    const total = (q.options || []).length;
    stage.querySelectorAll(".rank-item").forEach((el) => {
      el.addEventListener("click", () => {
        const idx = +el.dataset.idx;
        const pos = rankState.indexOf(idx);
        if (pos >= 0) rankState.splice(pos, 1);
        else rankState.push(idx);
        render(); // 重繪整個題目以更新編號
      });
    });
    document.getElementById("submitBtn")?.addEventListener("click", async () => {
      if (rankState.length !== total) return showToast("請完成所有項目的排序");
      await submitResponse([...rankState]);
    });
  }
}

async function submitResponse(value) {
  try {
    const rRef = doc(db, "questions", currentQuestion.id, "responses", clientId);
    await setDoc(rRef, { value, clientId, createdAt: serverTimestamp() });
    myResponse = value;
    showToast("已送出，謝謝！");
    render();
  } catch (e) {
    showToast("送出失敗，請檢查網路後再試一次");
  }
}
