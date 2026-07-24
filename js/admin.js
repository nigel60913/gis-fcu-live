import {
  db,
  auth,
  doc,
  collection,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
  increment,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  ADMIN_EMAILS,
} from "./firebase.js";
import { escapeHtml, formatType, typeIcon, clamp } from "./utils.js";
import { toast, bindNetworkStatus, friendlyError } from "./ui.js";
import { SessionTimer } from "./timer.js";
const REVEAL_MODES_BY_TYPE = {
  single: ["results", "fastest", "correctness"],
  quiz: ["results", "fastest", "correctness"],
  yesno: ["results", "fastest", "correctness"],
  multi: ["results", "fastest", "correctness"],
  ranking: ["ranking"],
  emoji: ["results"],
  rating: ["average"],
  slider: ["average"],
  open: ["wordcloud"],
  wordcloud: ["wordcloud"],
};
const REVEAL_LABELS = {
  results: "投票結果",
  fastest: "搶答最快的人",
  correctness: "正確／錯誤統計",
  ranking: "排序結果",
  average: "平均分數",
  wordcloud: "文字雲",
};
const $ = (id) => document.getElementById(id),
  sessionRef = doc(db, "session", "current"),
  questionsCol = collection(db, "questions");
let questions = [],
  session = { activeQuestionId: null, state: "idle" },
  responses = [],
  editingId = null,
  currentType = "single",
  options = [],
  correctIndex = null,
  correctIndexes = [],
  revealMode = "results",
  selectedTimerSeconds = 60,
  draggedQuestionId = null;
bindNetworkStatus();
onAuthStateChanged(auth, (user) => {
  const allowed =
    user && (ADMIN_EMAILS.length === 0 || ADMIN_EMAILS.includes(user.email));
  $("loginGate").hidden = !!allowed;
  $("appRoot").hidden = !allowed;
  $("btnSignOut").hidden = !allowed;
  $("userLabel").textContent = allowed ? user.displayName || user.email : "";
  if (allowed) boot();
  else if (user) $("loginErr").textContent = "此帳號不在主持人授權名單";
});
$("btnSignIn").onclick = () =>
  signInWithPopup(auth, new GoogleAuthProvider()).catch(
    (e) => ($("loginErr").textContent = friendlyError(e)),
  );
$("btnSignOut").onclick = () => signOut(auth);
function boot() {
  wireStatic();
  renderQr();
  onSnapshot(query(questionsCol, orderBy("order")), (s) => {
    questions = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderQuestions();
    renderControl();
  });
  onSnapshot(sessionRef, async (s) => {
    if (!s.exists()) {
      await setDoc(sessionRef, {
        activeQuestionId: null,
        state: "idle",
        loginVersion: 1,
      });
      return;
    }
    session = s.data();
    if (!Number.isInteger(session.loginVersion)) {
      await updateDoc(sessionRef, { loginVersion: 1 });
      session = { ...session, loginVersion: 1 };
    }
    renderControl();
    watchResponses();
  });
}
let wired = false;
function wireStatic() {
  if (wired) return;
  wired = true;
  $("audienceLink").value = audienceUrl();
  $("displayLink").href = displayUrl();
  $("copyAudience").onclick = () =>
    navigator.clipboard
      .writeText(audienceUrl())
      .then(() => toast("連結已複製"));
  $("btnStart").onclick = startVoting;
  $("btnStop").onclick = () => changeState("locked");
  $("btnReveal").onclick = () => changeState("closed");
  $("btnNext").onclick = nextQuestion;
  $("btnLobby").onclick = returnToLobby;
  $("btnClear").onclick = clearResponses;
  $("btnClearResponses").onclick = clearResponses;
  $("btnDownloadResponses").onclick = downloadResponses;
  $("btnForceRelogin").onclick = forceAudienceRelogin;
  $("btnLottery").onclick = () =>
    updateDoc(sessionRef, {
      state: "lottery",
      timerEndsAt: null,
      timerDuration: null,
    });
  $("btnNewQ").onclick = () => openEditor();
  $("btnLoadSeed").onclick = loadSeed;
  $("btnCancelEdit").onclick = closeEditor;
  $("btnSaveQ").onclick = saveQuestion;
  $("btnDeleteQ").onclick = deleteQuestion;
  $("fRevealMode").onchange = (e) => {
    revealMode = e.target.value;
    refreshEditor();
  };
  $("btnAddOpt").onclick = () => {
    options.push("");
    renderOptions();
  };
  $("timerSeconds").oninput = (event) => {
    selectedTimerSeconds = clamp(Number(event.target.value) || 60, 5, 3600);
    document
      .querySelectorAll("[data-time]")
      .forEach((button) =>
        button.classList.toggle(
          "selected",
          Number(button.dataset.time) === selectedTimerSeconds,
        ),
      );
  };
  document.querySelectorAll("[data-time]").forEach((button) => {
    button.onclick = () => {
      selectedTimerSeconds = Number(button.dataset.time);
      $("timerSeconds").value = selectedTimerSeconds;
      document
        .querySelectorAll("[data-time]")
        .forEach((item) => item.classList.toggle("selected", item === button));
    };
  });
}
function audienceUrl() {
  return location.href.replace(/admin\.html.*$/, "index.html");
}
function displayUrl() {
  return location.href.replace(/admin\.html.*$/, "display.html");
}
function renderQr() {
  const box = $("qrcode");
  box.innerHTML = "";
  if (window.QRCode)
    new QRCode(box, {
      text: audienceUrl(),
      width: 190,
      height: 190,
      colorDark: "#073B5C",
      colorLight: "#ffffff",
    });
}
const timer = new SessionTimer({
  onTick: (left, total) => {
    $("timerValue").textContent = left || "—";
    $("timerArc").style.strokeDashoffset = left
      ? 327 * (1 - left / total)
      : 327;
  },
  onDone: () => changeState("locked"),
});
async function startVoting() {
  if (!session.activeQuestionId) return toast("請先選擇題目");
  const seconds = clamp(
    Math.round(Number($("timerSeconds").value) || selectedTimerSeconds),
    5,
    3600,
  );
  selectedTimerSeconds = seconds;
  $("timerSeconds").value = seconds;
  const timerEndsAt = Date.now() + seconds * 1000;
  timer.start(seconds);
  await updateDoc(sessionRef, {
    state: "live",
    timerEndsAt,
    timerDuration: seconds,
  });
  toast(`投票已開始，${seconds} 秒後截止`);
}
async function changeState(state) {
  if (!session.activeQuestionId) return toast("請先選擇題目");
  await updateDoc(sessionRef, {
    state,
    timerEndsAt: null,
    timerDuration: null,
  });
  if (state !== "live") timer.stop();
  toast(
    { live: "投票已開始", locked: "投票已停止", closed: "答案已公布" }[state],
  );
}
function renderControl() {
  const loginVersionLabel = $("loginVersionLabel");
  if (loginVersionLabel)
    loginVersionLabel.textContent = `登入版本：${Number(session.loginVersion || 0)}`;
  const q = questions.find((x) => x.id === session.activeQuestionId),
    idx = questions.findIndex((x) => x.id === session.activeQuestionId);
  $("activeQTitle").textContent = q?.title || "尚未選擇題目";
  $("activeQMeta").textContent = q
    ? `${formatType(q.type)}・第 ${idx + 1} 題`
    : "從下方題庫選擇一題開始";
  $("activeQState").textContent =
    {
      idle: "等待中",
      live: "投票中",
      locked: "已停止",
      closed: "已公布",
      lottery: "抽獎中",
    }[session.state] || session.state;
  $("statQuestion").textContent =
    idx < 0 ? "—" : `${idx + 1}/${questions.length}`;
  renderQuestions();
}
function watchResponses() {
  window.responseUnsub?.();
  responses = [];
  $("statVotes").textContent = "0";
  renderResponseList();
  if (!session.activeQuestionId) return;
  window.responseUnsub = onSnapshot(
    collection(db, "questions", session.activeQuestionId, "responses"),
    (s) => {
      responses = s.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => timestampOf(b.createdAt) - timestampOf(a.createdAt));
      $("statVotes").textContent = responses.length;
      const audience = Math.max(
        responses.length,
        Number(session.onlineCount || 0),
      );
      $("statOnline").textContent = audience;
      $("statRate").textContent = audience
        ? `${Math.round((responses.length / audience) * 100)}%`
        : "0%";
      renderResponseList();
    },
  );
}
async function forceAudienceRelogin() {
  if (
    !confirm(
      "確定要讓所有觀眾重新輸入暱稱嗎？\n\n這會清除所有手機目前儲存的暱稱與裝置識別碼，\n但不會刪除已提交的回答紀錄。",
    )
  )
    return;
  await updateDoc(sessionRef, { loginVersion: increment(1) });
  toast("已要求所有觀眾重新登入。");
}
function timestampOf(value) {
  return value?.toMillis?.() ?? (value?.seconds || 0) * 1000;
}
function renderResponseList() {
  const list = $("responseList"),
    empty = $("responseEmpty"),
    badge = $("responseBadge"),
    clear = $("btnClearResponses"),
    download = $("btnDownloadResponses");
  if (!list) return;
  badge.textContent = responses.length;
  empty.hidden = responses.length > 0;
  clear.disabled = !responses.length;
  download.disabled = !responses.length;
  list.innerHTML = responses
    .map((response, index) => {
      const time = timestampOf(response.createdAt);
      return `<article class="response-person"><span class="response-avatar">${escapeHtml((response.nickname || "訪客").slice(0, 1).toUpperCase())}</span><div><strong>${escapeHtml(response.nickname || "訪客")}</strong><small>${time ? new Date(time).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "剛剛回答"}</small></div><span class="response-order">#${responses.length - index}</span><div class="response-answer"><span>回答內容</span><strong>${escapeHtml(formatResponseValue(response.value))}</strong></div></article>`;
    })
    .join("");
}
function activeQuestion() {
  return questions.find((question) => question.id === session.activeQuestionId);
}
function formatResponseValue(value) {
  const question = activeQuestion(),
    options =
      question?.type === "yesno" &&
      (!question.options || question.options.length < 2)
        ? ["是", "否"]
        : question?.options || [],
    emoji = ["😍", "😊", "😐", "🤔", "😢"];
  if (question?.type === "emoji")
    return emoji[Number(value)] || String(value ?? "");
  if (question?.type === "rating") return `${value} / 5`;
  if (question?.type === "slider") return String(value ?? "");
  if (Array.isArray(value)) {
    if (question?.type === "ranking")
      return value
        .map((item, index) => `${index + 1}. ${options[item] ?? item}`)
        .join(" → ");
    if (["multi", "wordcloud"].includes(question?.type))
      return value
        .map((item) =>
          question.type === "multi" ? (options[item] ?? item) : item,
        )
        .join("、");
    return value.join("、");
  }
  if (
    ["single", "quiz", "yesno"].includes(question?.type) &&
    Number.isInteger(value)
  )
    return options[value] ?? String(value);
  return String(value ?? "");
}
function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
function downloadResponses() {
  const question = activeQuestion();
  if (!question || !responses.length) return toast("目前沒有可下載的回答");
  const ordered = [...responses].sort(
      (a, b) => timestampOf(a.createdAt) - timestampOf(b.createdAt),
    ),
    rows = [
      ["題目", "題型", "答題順序", "暱稱", "回答內容", "回答時間", "Client ID"],
      ...ordered.map((response, index) => [
        question.title,
        formatType(question.type),
        index + 1,
        response.nickname || "訪客",
        formatResponseValue(response.value),
        timestampOf(response.createdAt)
          ? new Date(timestampOf(response.createdAt)).toLocaleString("zh-TW")
          : "",
        response.clientId || response.id,
      ]),
    ],
    csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n"),
    blob = new Blob([csv], { type: "text/csv;charset=utf-8" }),
    url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = `ESG-MM-${question.title.replace(/[\\/:*?"<>|]/g, "-").slice(0, 36)}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  toast(`已下載 ${responses.length} 筆回答`);
}
function renderQuestions() {
  if (!$("qList")) return;
  $("qEmpty").hidden = questions.length > 0;
  $("qList").innerHTML = questions
    .map(
      (q, i) =>
        `<article class="q-item ${q.id === session.activeQuestionId ? "active" : ""}" data-id="${q.id}" draggable="true"><button type="button" class="drag-handle" aria-label="拖曳調整順序" title="拖曳調整順序">⋮⋮</button><div class="q-index">${typeIcon(q.type)}</div><div><h3>${escapeHtml(q.title)}</h3><p>${i + 1}・${formatType(q.type)}・${escapeHtml(q.part || "")}</p></div><button class="icon-button" data-edit="${q.id}">•••</button></article>`,
    )
    .join("");
  document.querySelectorAll(".q-item").forEach(
    (el) =>
      (el.onclick = (e) => {
        if (e.target.dataset.edit || e.target.closest(".drag-handle")) return;
        setDoc(sessionRef, {
          ...session,
          activeQuestionId: el.dataset.id,
          state: "idle",
        });
      }),
  );
  document.querySelectorAll(".q-item").forEach((item) => {
    item.ondragstart = (event) => {
      draggedQuestionId = item.dataset.id;
      item.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedQuestionId);
    };
    item.ondragover = (event) => {
      event.preventDefault();
      if (item.dataset.id !== draggedQuestionId)
        item.classList.add("drag-over");
    };
    item.ondragleave = () => item.classList.remove("drag-over");
    item.ondrop = async (event) => {
      event.preventDefault();
      item.classList.remove("drag-over");
      await reorderQuestions(draggedQuestionId, item.dataset.id);
    };
    item.ondragend = () => {
      draggedQuestionId = null;
      document
        .querySelectorAll(".q-item")
        .forEach((row) => row.classList.remove("dragging", "drag-over"));
    };
  });
  document.querySelectorAll("[data-edit]").forEach(
    (b) =>
      (b.onclick = (e) => {
        e.stopPropagation();
        openEditor(b.dataset.edit);
      }),
  );
}
async function reorderQuestions(sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const reordered = [...questions],
    sourceIndex = reordered.findIndex((q) => q.id === sourceId),
    targetIndex = reordered.findIndex((q) => q.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const [moved] = reordered.splice(sourceIndex, 1);
  reordered.splice(targetIndex, 0, moved);
  const batch = writeBatch(db);
  reordered.forEach((question, index) =>
    batch.update(doc(questionsCol, question.id), { order: index + 1 }),
  );
  await batch.commit();
  toast("題目順序已更新");
}
function nextQuestion() {
  const i = questions.findIndex((q) => q.id === session.activeQuestionId),
    next = questions[i + 1];
  if (!next) return toast("已經是最後一題");
  setDoc(sessionRef, { ...session, activeQuestionId: next.id, state: "idle" });
}
async function returnToLobby() {
  timer.stop();
  await setDoc(sessionRef, {
    ...session,
    activeQuestionId: null,
    state: "idle",
    timerEndsAt: null,
    timerDuration: null,
  });
  toast("投影已回到等待大廳");
}
async function clearResponses() {
  if (!session.activeQuestionId) return toast("目前沒有進行中的題目");
  if (!responses.length) return toast("本題目前沒有回答");
  if (!confirm(`確定清空本題 ${responses.length} 份回答？此操作無法復原。`))
    return;
  const snap = await getDocs(
      collection(db, "questions", session.activeQuestionId, "responses"),
    ),
    batch = writeBatch(db);
  snap.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  toast("本題答案與回答名單已清空");
}
const types = [
  "single",
  "multi",
  "wordcloud",
  "open",
  "yesno",
  "emoji",
  "rating",
  "slider",
  "quiz",
  "ranking",
];
function openEditor(id = null) {
  editingId = id;
  const q = questions.find((x) => x.id === id);
  currentType = q?.type || "single";
  options = [
    ...(q?.options || (currentType === "yesno" ? ["是", "否"] : ["", ""])),
  ];
  correctIndex = Number.isInteger(q?.correctIndex) ? q.correctIndex : null;
  correctIndexes = Array.isArray(q?.correctIndexes)
    ? q.correctIndexes.map(Number).filter(Number.isInteger)
    : [];
  revealMode = q?.revealMode || "results";
  $("editorTitle").textContent = id ? "編輯題目" : "新增題目";
  $("fPart").value = q?.part || "ESG × MM";
  $("fTitle").value = q?.title || "";
  $("fMin").value = q?.min ?? 0;
  $("fMax").value = q?.max ?? 100;
  $("fWordLimit").value = q?.wordLimit ?? 20;
  $("fMultiLimit").value = q?.maxSelections ?? 2;
  $("fRevealMode").value = revealMode;
  $("btnDeleteQ").hidden = !id;
  $("typeGrid").innerHTML = types
    .map(
      (t) =>
        `<button type="button" class="type-choice ${t === currentType ? "selected" : ""}" data-type="${t}">${typeIcon(t)}<br>${formatType(t)}</button>`,
    )
    .join("");
  document.querySelectorAll("[data-type]").forEach(
    (b) =>
      (b.onclick = () => {
        currentType = b.dataset.type;
        if (currentType === "yesno" && options.filter(Boolean).length < 2)
          options = ["是", "否"];
        if (!["single", "multi", "yesno", "quiz"].includes(currentType)) {
          correctIndex = null;
          correctIndexes = [];
        }
        document
          .querySelectorAll("[data-type]")
          .forEach((x) =>
            x.classList.toggle("selected", x.dataset.type === currentType),
          );
        refreshEditor();
      }),
  );
  refreshEditor();
  $("editor").showModal();
}
function refreshEditor() {
  const hasOptions = ["single", "multi", "yesno", "quiz", "ranking"].includes(
      currentType,
    ),
    allowed = REVEAL_MODES_BY_TYPE[currentType] || ["results"];
  if (!allowed.includes(revealMode)) revealMode = allowed[0];
  $("fRevealMode").innerHTML = allowed
    .map((mode) => `<option value="${mode}">${REVEAL_LABELS[mode]}</option>`)
    .join("");
  $("fRevealMode").value = revealMode;
  $("revealHint").textContent =
    revealMode === "fastest"
      ? "請設定正確答案。搶答排行榜只會顯示答對且最快的前 5 名。"
      : revealMode === "correctness"
        ? "請在選項左側標記正確答案，公布時顯示答對／答錯統計。"
        : revealMode === "ranking"
          ? "依所有回答計算各選項的平均順位。"
          : revealMode === "average"
            ? "公布所有有效回答的平均值。"
            : revealMode === "wordcloud"
              ? "以文字雲呈現高頻回答。"
              : "公布各選項的即時票數與比例。";
  $("optionsField").hidden = !hasOptions;
  $("rangeFields").hidden = currentType !== "slider";
  $("rangeFields").style.display = currentType === "slider" ? "grid" : "none";
  $("wordLimitField").hidden = !["wordcloud", "open"].includes(currentType);
  $("multiLimitField").hidden = currentType !== "multi";
  renderOptions();
}
function renderOptions() {
  const canMarkSingle =
      ["single", "yesno", "quiz"].includes(currentType) &&
      ["fastest", "correctness"].includes(revealMode),
    canMarkMulti =
      currentType === "multi" &&
      ["fastest", "correctness"].includes(revealMode);
  $("optList").innerHTML = options
    .map(
      (o, i) =>
        `<div class="opt-row">${canMarkSingle ? `<input type="radio" name="correct" data-correct="${i}" ${correctIndex === i ? "checked" : ""} title="設為正確答案" style="width:auto">` : canMarkMulti ? `<input type="checkbox" data-correct-multi="${i}" ${correctIndexes.includes(i) ? "checked" : ""} title="設為正確答案" style="width:auto">` : ""}<input data-opt="${i}" value="${escapeHtml(o)}" placeholder="選項 ${i + 1}"><button type="button" class="icon-button" data-remove="${i}">×</button></div>`,
    )
    .join("");
  document
    .querySelectorAll("[data-opt]")
    .forEach(
      (i) => (i.oninput = () => (options[Number(i.dataset.opt)] = i.value)),
    );
  document
    .querySelectorAll("[data-correct]")
    .forEach(
      (i) => (i.onchange = () => (correctIndex = Number(i.dataset.correct))),
    );
  document.querySelectorAll("[data-correct-multi]").forEach(
    (i) =>
      (i.onchange = () => {
        const value = Number(i.dataset.correctMulti);
        correctIndexes = i.checked
          ? [...new Set([...correctIndexes, value])]
          : correctIndexes.filter((index) => index !== value);
      }),
  );
  document.querySelectorAll("[data-remove]").forEach(
    (b) =>
      (b.onclick = () => {
        const removed = Number(b.dataset.remove);
        options.splice(removed, 1);
        if (correctIndex === removed) correctIndex = null;
        else if (correctIndex > removed) correctIndex -= 1;
        correctIndexes = correctIndexes
          .filter((index) => index !== removed)
          .map((index) => (index > removed ? index - 1 : index));
        renderOptions();
      }),
  );
}
function closeEditor() {
  $("editor").close();
}
async function saveQuestion() {
  const title = $("fTitle").value.trim();
  if (!title) return toast("請輸入題目");
  const cleanOptions = options.map((x) => x.trim()).filter(Boolean),
    canMarkSingle = ["single", "yesno", "quiz"].includes(currentType),
    canMarkMulti = currentType === "multi";
  if (
    ["single", "multi", "yesno", "quiz", "ranking"].includes(currentType) &&
    cleanOptions.length < 2
  )
    return toast("請至少輸入兩個選項");
  const rawMultiLimit = Math.round(Number($("fMultiLimit").value) || 1);
  if (currentType === "multi" && rawMultiLimit > cleanOptions.length)
    return toast("最多可選題數不可超過選項數量");
  const wordLimit = clamp(
      Math.round(Number($("fWordLimit").value) || 20),
      1,
      120,
    ),
    maxSelections = clamp(rawMultiLimit, 1, Math.max(1, cleanOptions.length));
  if (["fastest", "correctness"].includes(revealMode)) {
    if (canMarkSingle && !Number.isInteger(correctIndex))
      return toast(
        revealMode === "fastest"
          ? "使用「搶答最快的人」前，請先設定正確答案。"
          : "請標記一個正確答案",
      );
    if (canMarkMulti && !correctIndexes.length)
      return toast(
        revealMode === "fastest"
          ? "使用「搶答最快的人」前，請先設定正確答案。"
          : "請至少標記一個正確答案",
      );
  }
  const payload = {
    part: $("fPart").value.trim() || "ESG × MM",
    type: currentType,
    title,
    options: cleanOptions,
    min: Number($("fMin").value),
    max: Number($("fMax").value),
    revealMode,
    correctIndex: canMarkSingle ? correctIndex : null,
    correctIndexes: canMarkMulti ? correctIndexes : null,
    wordLimit: ["wordcloud", "open"].includes(currentType) ? wordLimit : null,
    maxSelections: currentType === "multi" ? maxSelections : null,
  };
  if (editingId) await updateDoc(doc(questionsCol, editingId), payload);
  else
    await addDoc(questionsCol, {
      ...payload,
      order: (questions.at(-1)?.order ?? 0) + 1,
      createdAt: serverTimestamp(),
    });
  closeEditor();
  toast("題目已儲存");
}
async function deleteQuestion() {
  if (!editingId || !confirm("確定刪除這一題？")) return;
  await deleteDoc(doc(questionsCol, editingId));
  if (session.activeQuestionId === editingId)
    await setDoc(sessionRef, { activeQuestionId: null, state: "idle" });
  closeEditor();
  toast("題目已刪除");
}
async function loadSeed() {
  if (questions.length && !confirm("將新增 v2.0 範例題目，確定繼續？")) return;
  const seed = [
    ["wordcloud", "ESG 對你而言，第一個想到的關鍵字是？", []],
    ["emoji", "你現在的心情是？", []],
    ["rating", "你對今天活動的期待程度？", []],
    ["yesno", "你今天有使用 AI 工具嗎？", ["是", "否"]],
    ["slider", "你認為企業 ESG 成熟度是幾分？", []],
    ["single", "最想深入了解哪個 ESG 面向？", ["環境 E", "社會 S", "治理 G"]],
    ["open", "留下一句給未來團隊的話", []],
  ];
  const batch = writeBatch(db);
  seed.forEach(([type, title, opts], i) =>
    batch.set(doc(questionsCol), {
      part: "ESG × MM",
      type,
      title,
      options: opts,
      order: (questions.at(-1)?.order ?? 0) + i + 1,
      createdAt: serverTimestamp(),
    }),
  );
  await batch.commit();
  toast("v2.0 範例題目已加入");
}
