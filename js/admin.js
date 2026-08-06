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
  timerQuestionId = null,
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
  $("btnLottery").onclick = () => {
    const lotteryWindow = window.open(lotteryUrl(), "_blank");
    if (lotteryWindow) lotteryWindow.opener = null;
    else toast("瀏覽器已阻擋新視窗，請允許彈出視窗後再試一次");
  };
  $("btnNewQ").onclick = () => openEditor();
  $("btnLoadSeed").onclick = loadSeed;
  $("btnTemplate").onclick = downloadQuestionTemplate;
  $("btnExportQuestions").onclick = exportQuestionsExcel;
  $("btnImportQuestions").onclick = () => $("questionExcelFile").click();
  $("questionExcelFile").onchange = importQuestionsExcel;
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
    selectTimerDuration(Number(event.target.value) || 60, false);
  };
  document.querySelectorAll("[data-time]").forEach((button) => {
    button.onclick = () => {
      selectTimerDuration(Number(button.dataset.time));
    };
  });
}
function selectTimerDuration(value, syncInput = true) {
  selectedTimerSeconds = clamp(Math.round(Number(value) || 60), 5, 3600);
  if (syncInput) $("timerSeconds").value = selectedTimerSeconds;
  document
    .querySelectorAll("[data-time]")
    .forEach((button) =>
      button.classList.toggle(
        "selected",
        Number(button.dataset.time) === selectedTimerSeconds,
      ),
    );
}
function audienceUrl() {
  return location.href.replace(/admin\.html.*$/, "index.html");
}
function displayUrl() {
  return location.href.replace(/admin\.html.*$/, "display.html");
}
function lotteryUrl() {
  return location.href.replace(/admin\.html.*$/, "lottery.html");
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
  if (q && timerQuestionId !== q.id) {
    selectTimerDuration(q.timerDuration ?? 60);
    timerQuestionId = q.id;
  } else if (!q) timerQuestionId = null;
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
        `<article class="q-item ${q.id === session.activeQuestionId ? "active" : ""}" data-id="${q.id}" draggable="true"><button type="button" class="drag-handle" aria-label="拖曳調整順序" title="拖曳調整順序">⋮⋮</button><div class="q-index">${typeIcon(q.type)}</div><div><h3>${escapeHtml(q.title)}</h3><p>${i + 1}・${formatType(q.type)}・${escapeHtml(q.part || "")}・${clamp(Math.round(Number(q.timerDuration) || 60), 5, 3600)} 秒</p></div><button class="icon-button" data-edit="${q.id}">•••</button></article>`,
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
  $("fTimerDuration").value = q?.timerDuration ?? 60;
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
    maxSelections = clamp(rawMultiLimit, 1, Math.max(1, cleanOptions.length)),
    timerDuration = clamp(
      Math.round(Number($("fTimerDuration").value) || 60),
      5,
      3600,
    );
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
    timerDuration,
  };
  if (editingId) {
    if (editingId === session.activeQuestionId) timerQuestionId = null;
    await updateDoc(doc(questionsCol, editingId), payload);
  }
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


const QUESTION_EXCEL_HEADERS = [
  "題號", "分類", "題型", "題目", "選項1", "選項2", "選項3", "選項4", "選項5",
  "選項6", "選項7", "選項8", "選項9", "選項10", "正確答案", "結果呈現",
  "最小值", "最大值", "文字字數上限", "多選上限", "倒數秒數"
];
const TYPE_ALIASES = {
  "單選題":"single", "單選":"single", single:"single",
  "多選題":"multi", "多選":"multi", multi:"multi",
  "文字雲":"wordcloud", wordcloud:"wordcloud",
  "開放題":"open", "開放式":"open", open:"open",
  "是非題":"yesno", "是非":"yesno", yesno:"yesno",
  "表情":"emoji", emoji:"emoji",
  "評分":"rating", rating:"rating",
  "滑桿":"slider", slider:"slider",
  "測驗題":"quiz", "測驗":"quiz", quiz:"quiz",
  "排序題":"ranking", "排序":"ranking", ranking:"ranking"
};
const REVEAL_ALIASES = {
  "投票結果":"results", results:"results", "搶答最快的人":"fastest", fastest:"fastest",
  "正確／錯誤統計":"correctness", "正確/錯誤統計":"correctness", correctness:"correctness",
  "排序結果":"ranking", ranking:"ranking", "平均分數":"average", average:"average",
  "文字雲":"wordcloud", wordcloud:"wordcloud"
};
function ensureXlsx(){if(!window.XLSX){toast("Excel 元件尚未載入，請確認網路連線後重新整理");return false}return true}
function questionRows(source=questions){return source.map((q,index)=>{
  const row={"題號":index+1,"分類":q.part||"ESG × MM","題型":formatType(q.type),"題目":q.title||""};
  (q.options||[]).slice(0,10).forEach((v,i)=>row[`選項${i+1}`]=v);
  row["正確答案"]=Array.isArray(q.correctIndexes)?q.correctIndexes.map(i=>i+1).join(","):(Number.isInteger(q.correctIndex)?q.correctIndex+1:"");
  row["結果呈現"]=REVEAL_LABELS[q.revealMode]||q.revealMode||"投票結果";
  row["最小值"]=q.min??0; row["最大值"]=q.max??100; row["文字字數上限"]=q.wordLimit??"";
  row["多選上限"]=q.maxSelections??""; row["倒數秒數"]=q.timerDuration??60; return row;
})}
function setSheetWidths(ws){ws["!cols"]=[{wch:7},{wch:16},{wch:13},{wch:42},...Array(10).fill({wch:20}),{wch:14},{wch:18},{wch:10},{wch:10},{wch:14},{wch:12},{wch:12}]}
function buildQuestionWorkbook(rows){
  const wb=XLSX.utils.book_new(), ws=XLSX.utils.json_to_sheet(rows,{header:QUESTION_EXCEL_HEADERS}); setSheetWidths(ws); XLSX.utils.book_append_sheet(wb,ws,"題目");
  const instructions=[
    ["欄位","填寫說明"],["題型","可填：單選題、多選題、文字雲、開放題、是非題、表情、評分、滑桿、測驗題、排序題"],
    ["選項1～10","單選、多選、是非、測驗、排序至少填2個；其他題型可留白"],["正確答案","填選項編號，例如 2；多選題可填 1,3"],
    ["結果呈現","投票結果、搶答最快的人、正確／錯誤統計、排序結果、平均分數、文字雲"],
    ["最小值／最大值","僅滑桿題使用"],["文字字數上限","文字雲或開放題使用，建議 1～120"],["多選上限","多選題使用，不可超過選項數"],
    ["倒數秒數","5～3600 秒，未填時預設 60 秒"],["匯入方式","匯入時會將 Excel 題目追加至現有題庫，不會刪除原題目"]
  ];
  const help=XLSX.utils.aoa_to_sheet(instructions);help["!cols"]=[{wch:20},{wch:75}];XLSX.utils.book_append_sheet(wb,help,"填寫說明");return wb;
}
function downloadQuestionTemplate(){if(!ensureXlsx())return;const sample=[{"題號":1,"分類":"ESG × MM","題型":"單選題","題目":"最想深入了解哪個 ESG 面向？","選項1":"環境 E","選項2":"社會 S","選項3":"治理 G","正確答案":"","結果呈現":"投票結果","最小值":0,"最大值":100,"文字字數上限":"","多選上限":"","倒數秒數":60}];XLSX.writeFile(buildQuestionWorkbook(sample),"題目匯入範本.xlsx");toast("已下載題目匯入範本")}
function exportQuestionsExcel(){if(!ensureXlsx())return;if(!questions.length)return toast("目前沒有題目可匯出");XLSX.writeFile(buildQuestionWorkbook(questionRows()),`ESG-MM-題庫-${new Date().toISOString().slice(0,10)}.xlsx`);toast(`已匯出 ${questions.length} 題`)}
function normalizeCell(v){return String(v??"").trim()}
function parseCorrect(value,type,optionCount){const nums=normalizeCell(value).split(/[,，、;；\s]+/).filter(Boolean).map(x=>Number(x)-1).filter(x=>Number.isInteger(x)&&x>=0&&x<optionCount);return type==="multi"?{correctIndexes:[...new Set(nums)],correctIndex:null}:{correctIndex:nums.length?nums[0]:null,correctIndexes:null}}
function parseImportedRow(row,rowNo){
  const title=normalizeCell(row["題目"]), rawType=normalizeCell(row["題型"]), type=TYPE_ALIASES[rawType.toLowerCase()]||TYPE_ALIASES[rawType];
  if(!title)return {error:`第 ${rowNo} 列：題目不可空白`}; if(!type)return {error:`第 ${rowNo} 列：無法辨識題型「${rawType}」`};
  const opts=Array.from({length:10},(_,i)=>normalizeCell(row[`選項${i+1}`])).filter(Boolean);
  if(["single","multi","yesno","quiz","ranking"].includes(type)&&opts.length<2)return {error:`第 ${rowNo} 列：此題型至少需要 2 個選項`};
  const allowed=REVEAL_MODES_BY_TYPE[type]||["results"], rawReveal=normalizeCell(row["結果呈現"]), mapped=REVEAL_ALIASES[rawReveal.toLowerCase()]||REVEAL_ALIASES[rawReveal], revealMode=allowed.includes(mapped)?mapped:allowed[0];
  const correct=parseCorrect(row["正確答案"],type,opts.length), min=Number(row["最小值"]), max=Number(row["最大值"]), wordLimit=clamp(Number(row["文字字數上限"])||20,1,120), maxSelections=clamp(Number(row["多選上限"])||2,1,Math.max(1,opts.length)), timerDuration=clamp(Number(row["倒數秒數"])||60,5,3600);
  return {value:{part:normalizeCell(row["分類"])||"ESG × MM",type,title,options:opts,min:Number.isFinite(min)?min:0,max:Number.isFinite(max)?max:100,revealMode,...correct,wordLimit:["wordcloud","open"].includes(type)?wordLimit:null,maxSelections:type==="multi"?maxSelections:null,timerDuration}};
}
async function importQuestionsExcel(event){
  const input=event.target,file=input.files?.[0];input.value="";if(!file||!ensureXlsx())return;
  try{const data=await file.arrayBuffer(),wb=XLSX.read(data,{type:"array"}),ws=wb.Sheets["題目"]||wb.Sheets[wb.SheetNames[0]],rows=XLSX.utils.sheet_to_json(ws,{defval:""});if(!rows.length)return toast("Excel 中沒有可匯入的題目");
    const parsed=rows.map((r,i)=>parseImportedRow(r,i+2)),errors=parsed.filter(x=>x.error).map(x=>x.error);if(errors.length){alert(`匯入失敗，請修正以下內容：\n\n${errors.slice(0,20).join("\n")}${errors.length>20?`\n…另有 ${errors.length-20} 筆錯誤`:""}`);return}
    if(!confirm(`將追加匯入 ${parsed.length} 題至目前題庫，確定繼續？`))return;let base=(questions.at(-1)?.order??0);for(let start=0;start<parsed.length;start+=450){const batch=writeBatch(db);parsed.slice(start,start+450).forEach((item,i)=>batch.set(doc(questionsCol),{...item.value,order:base+start+i+1,createdAt:serverTimestamp()}));await batch.commit()}toast(`成功匯入 ${parsed.length} 題`);
  }catch(error){console.error(error);toast(`匯入失敗：${friendlyError(error)}`)}
}
