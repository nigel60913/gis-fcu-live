import {
  db, doc, getDoc, setDoc, onSnapshot, serverTimestamp,
} from "./firebase-init.js";
import { getClientId, getNickname, setNickname, showToast, escapeHtml } from "./utils.js";

const clientId = getClientId();
const stage = document.getElementById("stage");
const stateTag = document.getElementById("stateTag");
const SESSION_REF = doc(db, "session", "current");

let session = { activeQuestionId: null, state: "idle" };
let currentQuestion = null;
let myResponse = null;      // 目前這題我送出的值
let unsubQuestion = null;
let started = false;

// ---------- 暱稱登入（像 Kahoot 一樣先輸入名字） ----------
function boot() {
  const nick = getNickname();
  if (!nick) {
    renderNameGate();
  } else {
    startListening();
  }
}

function renderNameGate() {
  stateTag.textContent = "請先輸入暱稱";
  stage.innerHTML = `
    <div class="card nick-gate">
      <div class="eyebrow">加入現場互動</div>
      <h2 style="font-size:22px; margin-top:14px;">你的暱稱是？</h2>
      <p class="muted" style="margin-top:8px;">答題時會顯示這個名字，讓主持人和大家看到是誰答對／發言的</p>
      <input type="text" id="nickInput" maxlength="12" placeholder="例如：小明" style="margin-top:18px;" />
      <button id="nickGo" class="btn btn-primary btn-block" style="margin-top:14px;">開始作答</button>
    </div>`;
  const input = document.getElementById("nickInput");
  input.focus();
  const go = () => {
    const v = input.value.trim();
    if (!v) return showToast("請輸入暱稱");
    setNickname(v);
    startListening();
  };
  document.getElementById("nickGo").addEventListener("click", go);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
}

function startListening() {
  if (started) return;
  started = true;
  onSnapshot(SESSION_REF, async (snap) => {
    session = snap.exists() ? snap.data() : { activeQuestionId: null, state: "idle" };
    await loadActiveQuestion();
  });

  // 安全網：手機切到背景太久，Firestore 連線偶爾會斷掉沒自動恢復，
  // 回到前景時強制重新讀取一次目前狀態，避免卡在舊畫面
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const snap = await getDoc(SESSION_REF);
      session = snap.exists() ? snap.data() : { activeQuestionId: null, state: "idle" };
      await loadActiveQuestion();
    } catch { /* 忽略暫時性錯誤 */ }
  });
}

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
      <h3 style="font-size:18px; margin-bottom:8px;">嗨，${escapeHtml(getNickname())}！</h3>
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

// ---------- Word cloud：可以送出多筆答案 ----------
const MAX_WORDS = 5;
let wcWords = [];
function renderWordcloudForm(q, locked) {
  wcWords = Array.isArray(myResponse) ? [...myResponse] : myResponse ? [myResponse] : [];
  if (locked) {
    return `<p class="muted">已公布文字雲，請看大螢幕。${
      wcWords.length ? `你送出的是：${wcWords.map((w) => `「${escapeHtml(w)}」`).join("、")}` : ""
    }</p>`;
  }
  const chips = wcWords
    .map((w, i) => `<span class="pill" data-del="${i}" style="cursor:pointer; margin:0 6px 6px 0;">${escapeHtml(w)} ✕</span>`)
    .join("");
  return `
    <div id="wcChips" style="margin-bottom:${wcWords.length ? "12px" : "0"};">${chips}</div>
    <div class="row">
      <input type="text" id="wcInput" maxlength="24" placeholder="輸入一個詞，按 Enter 或＋新增" class="grow" />
      <button id="wcAdd" class="btn btn-ghost btn-sm">＋</button>
    </div>
    <p class="muted" style="margin-top:8px;">最多可送出 ${MAX_WORDS} 個詞，越簡短越適合文字雲</p>
    <button id="submitBtn" class="btn btn-primary btn-block" style="margin-top:14px;" ${wcWords.length ? "" : "disabled"}>
      送出（${wcWords.length}/${MAX_WORDS}）
    </button>`;
}

// ---------- Single / Multi / Quiz：先選、按確認才送出 ----------
let pendingChoice = new Set();
function renderChoiceForm(q, locked, isMulti) {
  const submittedSel = isMulti
    ? Array.isArray(myResponse) ? myResponse : []
    : typeof myResponse === "number" ? [myResponse] : [];
  if (!locked) pendingChoice = new Set(submittedSel);
  const letters = "ABCDEFGH";

  const options = (q.options || [])
    .map((opt, i) => {
      let cls = "opt-btn";
      const isSel = locked ? submittedSel.includes(i) : pendingChoice.has(i);
      if (isSel) cls += " selected";
      if (locked && q.type === "quiz") {
        if (i === q.correctIndex) cls += " correct";
        else if (submittedSel.includes(i)) cls += " wrong";
      }
      return `<button type="button" class="${cls}" data-idx="${i}" ${locked ? "disabled" : ""}>
        <span class="opt-letter">${letters[i] || i + 1}</span>
        <span>${escapeHtml(opt)}</span>
      </button>`;
    })
    .join("");

  const alreadySubmitted = submittedSel.length > 0;
  const submitBtn = locked
    ? ""
    : `<button id="submitBtn" class="btn btn-primary btn-block" style="margin-top:14px;" ${pendingChoice.size ? "" : "disabled"}>
        ${alreadySubmitted ? "確認更新答案" : "確認送出"}
      </button>`;

  const hint = locked
    ? q.type === "quiz"
      ? submittedSel.includes(q.correctIndex) ? "🎉 你答對了！" : "答案已公布，看看正確答案吧"
      : "已公布結果，請看大螢幕"
    : isMulti
    ? "可複選，選好後按下方確認送出"
    : "選好後按下方確認送出";

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
        : `<button id="submitBtn" class="btn btn-primary btn-block" style="margin-top:6px;" ${rankState.length === (q.options || []).length ? "" : "disabled"}>確認送出排名</button>`
    }`;
}

// ---------- Wiring ----------
function wireForm(q, locked) {
  if (locked) return;

  if (q.type === "wordcloud") {
    const addWord = () => {
      const input = document.getElementById("wcInput");
      const v = input.value.trim();
      if (!v) return;
      if (wcWords.length >= MAX_WORDS) return showToast(`最多 ${MAX_WORDS} 個詞`);
      wcWords.push(v);
      input.value = "";
      rerenderWc();
    };
    document.getElementById("wcAdd")?.addEventListener("click", addWord);
    document.getElementById("wcInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); addWord(); }
    });
    stage.querySelectorAll("#wcChips [data-del]").forEach((el) => {
      el.addEventListener("click", () => {
        wcWords.splice(+el.dataset.del, 1);
        rerenderWc();
      });
    });
    document.getElementById("submitBtn")?.addEventListener("click", async () => {
      if (!wcWords.length) return showToast("請至少輸入一個詞");
      await submitResponse([...wcWords]);
    });
    return;
  }

  if (q.type === "single" || q.type === "quiz") {
    stage.querySelectorAll(".opt-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = +btn.dataset.idx;
        pendingChoice = new Set([idx]); // 單選：換選項
        stage.querySelectorAll(".opt-btn").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        const sb = document.getElementById("submitBtn");
        if (sb) sb.disabled = false;
      });
    });
    document.getElementById("submitBtn")?.addEventListener("click", async () => {
      if (!pendingChoice.size) return showToast("請先選一個選項");
      await submitResponse([...pendingChoice][0]);
    });
    return;
  }

  if (q.type === "multi") {
    stage.querySelectorAll(".opt-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = +btn.dataset.idx;
        if (pendingChoice.has(idx)) { pendingChoice.delete(idx); btn.classList.remove("selected"); }
        else { pendingChoice.add(idx); btn.classList.add("selected"); }
        const sb = document.getElementById("submitBtn");
        if (sb) sb.disabled = pendingChoice.size === 0;
      });
    });
    document.getElementById("submitBtn")?.addEventListener("click", async () => {
      if (!pendingChoice.size) return showToast("請至少選一項");
      await submitResponse([...pendingChoice].sort((a, b) => a - b));
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

function rerenderWc() {
  const q = currentQuestion;
  stage.querySelector(".card > div:last-child").innerHTML = renderWordcloudForm(q, false);
  wireForm(q, false);
}

async function submitResponse(value) {
  try {
    const rRef = doc(db, "questions", currentQuestion.id, "responses", clientId);
    await setDoc(rRef, { value, clientId, nickname: getNickname(), createdAt: serverTimestamp() });
    myResponse = value;
    showToast("已送出，謝謝！");
    render();
  } catch (e) {
    showToast("送出失敗，請檢查網路後再試一次");
  }
}

boot();
