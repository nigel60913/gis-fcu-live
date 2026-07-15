import {
  db, auth, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp, writeBatch,
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, ADMIN_EMAILS,
} from "./firebase-init.js";
import { showToast, TYPE_LABEL, TYPE_ICON, escapeHtml } from "./utils.js";
import { SEED_QUESTIONS } from "./seed-questions.js";

const PARTS = ["暖場", "全員互動", "ESG 共創", "Closing"];
const QUESTIONS_COL = collection(db, "questions");
const SESSION_REF = doc(db, "session", "current");

let questions = [];        // 全部題目（依 order 排序）
let sessionState = { activeQuestionId: null, state: "idle" };
let editingId = null;      // null = 新增；否則為編輯中的題目 id
let respUnsub = null;

// ---------------- Auth ----------------
document.getElementById("btnSignIn").addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    document.getElementById("loginErr").style.display = "block";
    document.getElementById("loginErr").textContent = "登入失敗：" + e.message;
  }
});
document.getElementById("btnSignOut").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  const gate = document.getElementById("loginGate");
  const root = document.getElementById("appRoot");
  const signOutBtn = document.getElementById("btnSignOut");
  const userLabel = document.getElementById("userLabel");

  if (user && ADMIN_EMAILS.includes(user.email)) {
    gate.style.display = "none";
    root.style.display = "block";
    signOutBtn.style.display = "inline-flex";
    userLabel.textContent = user.email;
    boot();
  } else if (user) {
    signOut(auth);
    document.getElementById("loginErr").style.display = "block";
    document.getElementById("loginErr").textContent = "此帳號未被授權，請聯絡系統管理者加入白名單（firebase-config.js）";
  } else {
    gate.style.display = "flex";
    root.style.display = "none";
    signOutBtn.style.display = "none";
    userLabel.textContent = "";
  }
});

function boot() {
  setupLinks();
  listenQuestions();
  listenSession();
  wireSessionButtons();
  wireEditor();
}

// ---------------- Links / QR ----------------
function setupLinks() {
  const origin = location.origin + location.pathname.replace(/admin\.html$/, "");
  const audienceUrl = origin + "index.html";
  const displayUrl = origin + "display.html";
  document.getElementById("audienceLink").value = audienceUrl;
  document.getElementById("displayLink").value = displayUrl;
  // eslint-disable-next-line no-undef
  new QRCode(document.getElementById("qrcode"), {
    text: audienceUrl,
    width: 168,
    height: 168,
    colorDark: "#005490",
    colorLight: "#ffffff",
  });
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.copy);
      input.select();
      navigator.clipboard?.writeText(input.value);
      showToast("已複製連結");
    });
  });
}

// ---------------- Questions list ----------------
function listenQuestions() {
  const q = query(QUESTIONS_COL, orderBy("order", "asc"));
  onSnapshot(q, (snap) => {
    questions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderQuestionList();
    renderSessionPanel();
  });
}

function renderQuestionList() {
  const listEl = document.getElementById("qList");
  const emptyEl = document.getElementById("qEmpty");
  if (!questions.length) {
    listEl.innerHTML = "";
    emptyEl.style.display = "block";
    return;
  }
  emptyEl.style.display = "none";

  let html = "";
  let lastPart = null;
  questions.forEach((qs, i) => {
    if (qs.part !== lastPart) {
      html += `<div class="part-heading">${escapeHtml(qs.part)}</div>`;
      lastPart = qs.part;
    }
    const isActive = qs.id === sessionState.activeQuestionId;
    html += `
      <div class="q-item ${isActive ? "active-q" : ""}" data-id="${qs.id}">
        <div class="idx">${TYPE_ICON[qs.type] || "•"}</div>
        <div class="body">
          <div class="t">${escapeHtml(qs.title || "（未命名題目）")}</div>
          <div class="meta">
            <span class="pill">${TYPE_LABEL[qs.type] || qs.type}</span>
            ${isActive ? '<span class="pill live">現正進行</span>' : ""}
          </div>
        </div>
        <div class="actions">
          <button class="icon-btn" data-act="play" title="設為現在題目">▶</button>
          <button class="icon-btn" data-act="edit" title="編輯">✎</button>
          <button class="icon-btn" data-act="dup" title="複製">⧉</button>
        </div>
      </div>`;
  });
  listEl.innerHTML = html;

  listEl.querySelectorAll(".q-item").forEach((item) => {
    const id = item.dataset.id;
    item.querySelector('[data-act="play"]').addEventListener("click", (e) => {
      e.stopPropagation();
      setActiveQuestion(id);
    });
    item.querySelector('[data-act="edit"]').addEventListener("click", (e) => {
      e.stopPropagation();
      openEditor(id);
    });
    item.querySelector('[data-act="dup"]').addEventListener("click", async (e) => {
      e.stopPropagation();
      const src = questions.find((x) => x.id === id);
      await addDoc(QUESTIONS_COL, {
        ...stripId(src),
        title: src.title + "（複製）",
        order: (questions[questions.length - 1]?.order ?? 0) + 1,
      });
      showToast("已複製題目");
    });
  });
}

function stripId(q) {
  const { id, ...rest } = q;
  return rest;
}

document.getElementById("btnLoadSeed").addEventListener("click", async () => {
  if (questions.length && !confirm("題庫目前非空，載入範本會附加在後面，確定要繼續嗎？")) return;
  const batch = writeBatch(db);
  let order = (questions[questions.length - 1]?.order ?? 0) + 1;
  SEED_QUESTIONS.forEach((q) => {
    const ref = doc(QUESTIONS_COL);
    batch.set(ref, { ...q, order: order++, createdAt: serverTimestamp() });
  });
  await batch.commit();
  showToast("範本題庫已載入，記得依實際內容調整選項");
});

document.getElementById("btnNewQ").addEventListener("click", () => openEditor(null));

// ---------------- Editor dialog ----------------
const TYPE_ORDER = ["wordcloud", "single", "multi", "ranking", "quiz"];
let currentType = "wordcloud";
let currentOptions = [];
let currentCorrect = null;

function wireEditor() {
  const grid = document.getElementById("typeGrid");
  grid.innerHTML = TYPE_ORDER.map(
    (t) => `<div class="type-choice" data-type="${t}">${TYPE_ICON[t]}<br>${TYPE_LABEL[t]}</div>`
  ).join("");
  grid.querySelectorAll(".type-choice").forEach((el) => {
    el.addEventListener("click", () => {
      currentType = el.dataset.type;
      refreshTypeUI();
    });
  });
  document.getElementById("btnAddOpt").addEventListener("click", () => {
    currentOptions.push("");
    renderOptEditor();
  });
  document.getElementById("btnCancelEdit").addEventListener("click", () => closeEditor());
  document.getElementById("btnSaveQ").addEventListener("click", saveQuestion);
  document.getElementById("btnDeleteQ").addEventListener("click", deleteQuestionFromEditor);
}

function refreshTypeUI() {
  document.querySelectorAll(".type-choice").forEach((el) => {
    el.classList.toggle("sel", el.dataset.type === currentType);
  });
  const needsOptions = currentType !== "wordcloud";
  document.getElementById("optionsField").style.display = needsOptions ? "block" : "none";
  document.getElementById("quizHint").style.display = currentType === "quiz" ? "block" : "none";
  if (needsOptions && currentOptions.length === 0) {
    currentOptions = ["", ""];
  }
  renderOptEditor();
}

function renderOptEditor() {
  const wrap = document.getElementById("optList");
  wrap.innerHTML = currentOptions
    .map(
      (val, i) => `
      <div class="opt-edit-row">
        ${
          currentType === "quiz"
            ? `<input type="radio" name="correctOpt" ${currentCorrect === i ? "checked" : ""} data-idx="${i}" style="width:auto;" />`
            : ""
        }
        <input type="text" value="${escapeHtml(val)}" data-idx="${i}" placeholder="選項 ${i + 1}" />
        <button type="button" class="icon-btn" data-del="${i}">✕</button>
      </div>`
    )
    .join("");
  wrap.querySelectorAll('input[type=text]').forEach((inp) => {
    inp.addEventListener("input", (e) => {
      currentOptions[+e.target.dataset.idx] = e.target.value;
    });
  });
  wrap.querySelectorAll('input[type=radio]').forEach((r) => {
    r.addEventListener("change", (e) => (currentCorrect = +e.target.dataset.idx));
  });
  wrap.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = +btn.dataset.del;
      currentOptions.splice(idx, 1);
      if (currentCorrect === idx) currentCorrect = null;
      renderOptEditor();
    });
  });
}

function openEditor(id) {
  editingId = id;
  const dlg = document.getElementById("editor");
  const q = id ? questions.find((x) => x.id === id) : null;

  document.getElementById("editorTitle").textContent = id ? "編輯題目" : "新增題目";
  document.getElementById("btnDeleteQ").style.display = id ? "inline-flex" : "none";
  document.getElementById("fPart").value = q?.part || "全員互動";
  document.getElementById("fTitle").value = q?.title || "";
  currentType = q?.type || "wordcloud";
  currentOptions = q?.options ? [...q.options] : [];
  currentCorrect = typeof q?.correctIndex === "number" ? q.correctIndex : null;
  refreshTypeUI();
  dlg.showModal();
}

function closeEditor() {
  document.getElementById("editor").close();
  editingId = null;
}

async function saveQuestion() {
  const title = document.getElementById("fTitle").value.trim();
  if (!title) {
    showToast("請輸入題目內容");
    return;
  }
  const part = document.getElementById("fPart").value;
  const options = currentType === "wordcloud" ? [] : currentOptions.map((o) => o.trim()).filter(Boolean);
  if (currentType !== "wordcloud" && options.length < 2) {
    showToast("請至少輸入 2 個選項");
    return;
  }
  const payload = {
    part,
    type: currentType,
    title,
    options,
    correctIndex: currentType === "quiz" ? currentCorrect : null,
  };

  if (editingId) {
    await updateDoc(doc(QUESTIONS_COL, editingId), payload);
    showToast("題目已更新");
  } else {
    payload.order = (questions[questions.length - 1]?.order ?? 0) + 1;
    payload.createdAt = serverTimestamp();
    await addDoc(QUESTIONS_COL, payload);
    showToast("題目已新增");
  }
  closeEditor();
}

async function deleteQuestionFromEditor() {
  if (!editingId) return;
  if (!confirm("確定要刪除這一題嗎？此動作無法復原。")) return;
  if (sessionState.activeQuestionId === editingId) {
    await updateDoc(SESSION_REF, { activeQuestionId: null, state: "idle" });
  }
  await deleteDoc(doc(QUESTIONS_COL, editingId));
  showToast("已刪除題目");
  closeEditor();
}

// ---------------- Session control ----------------
function listenSession() {
  onSnapshot(SESSION_REF, async (snap) => {
    if (!snap.exists()) {
      await setDoc(SESSION_REF, { activeQuestionId: null, state: "idle" });
      return;
    }
    sessionState = snap.data();
    renderSessionPanel();
    watchResponses();
  });
}

function renderSessionPanel() {
  const activeQ = questions.find((q) => q.id === sessionState.activeQuestionId);
  document.getElementById("activeQTitle").textContent = activeQ ? activeQ.title : "尚未開始";
  const stateEl = document.getElementById("activeQState");
  const labelMap = { idle: "閒置中", live: "作答中", closed: "已公布結果" };
  stateEl.textContent = labelMap[sessionState.state] || "閒置中";
  stateEl.className = "pill" + (sessionState.state === "live" ? " live" : "");
  renderQuestionList();
}

function wireSessionButtons() {
  document.getElementById("btnPrev").addEventListener("click", () => stepQuestion(-1));
  document.getElementById("btnNext").addEventListener("click", () => stepQuestion(1));
  document.getElementById("btnReveal").addEventListener("click", async () => {
    if (!sessionState.activeQuestionId) return showToast("請先選一題");
    await updateDoc(SESSION_REF, { state: "closed" });
  });
  document.getElementById("btnReopen").addEventListener("click", async () => {
    if (!sessionState.activeQuestionId) return showToast("請先選一題");
    await updateDoc(SESSION_REF, { state: "live" });
  });
}

function stepQuestion(dir) {
  if (!questions.length) return;
  const curIdx = questions.findIndex((q) => q.id === sessionState.activeQuestionId);
  const nextIdx = curIdx < 0 ? 0 : curIdx + dir;
  if (nextIdx < 0 || nextIdx >= questions.length) return showToast(dir > 0 ? "已經是最後一題" : "已經是第一題");
  setActiveQuestion(questions[nextIdx].id);
}

async function setActiveQuestion(id) {
  await setDoc(SESSION_REF, { activeQuestionId: id, state: "live" });
  showToast("已切換題目");
}

function watchResponses() {
  if (respUnsub) respUnsub();
  document.getElementById("respCount").textContent = "0";
  if (!sessionState.activeQuestionId) return;
  const respCol = collection(db, "questions", sessionState.activeQuestionId, "responses");
  respUnsub = onSnapshot(respCol, (snap) => {
    document.getElementById("respCount").textContent = snap.size;
  });
}
