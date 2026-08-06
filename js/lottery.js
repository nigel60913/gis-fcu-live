import { db, auth, collection, getDocs, onAuthStateChanged, ADMIN_EMAILS } from "./firebase.js";
import { escapeHtml } from "./utils.js";
import { bindNetworkStatus } from "./ui.js";
import { WINNER_COUNT, buildParticipantPool, sampleParticipants, buildWinnersCsv, randomInt } from "./lottery-core.mjs";

const DRAW_DURATION_MS = 5000;
const VOLUME_KEY = "gisfcu_lottery_volume";
const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let participants = [];
let winners = [];
let drawStartedAt = null;
let drawing = false;
let pageBooted = false;
let responseCount = 0;
const embeddedInDisplay = new URLSearchParams(location.search).get("display") === "1";

bindNetworkStatus();
const audio = createLotteryAudio();
restoreVolume();

onAuthStateChanged(auth, async (user) => {
  const allowed = user && (ADMIN_EMAILS.length === 0 || ADMIN_EMAILS.includes(user.email));
  if (!allowed && !embeddedInDisplay) {
    $("lotteryStage").hidden = true;
    $("accessGate").hidden = false;
    $("gateMessage").textContent = user
      ? "此帳號不在主持人授權名單，請返回控制台改用授權帳號登入。"
      : "請先回到主持控制台，以 Google 帳號登入後再開啟抽獎頁。";
    $("backToAdmin").hidden = false;
    return;
  }
  $("accessGate").hidden = true;
  $("lotteryStage").hidden = false;
  document.body.classList.toggle("embedded-display", embeddedInDisplay);
  if (pageBooted) return;
  pageBooted = true;
  wireEvents();
  await loadParticipants();
});

function wireEvents() {
  $("btnDraw").onclick = () => startDraw(false);
  $("btnReload").onclick = loadParticipants;
  $("btnDrawAgain").onclick = () => startDraw(true);
  $("btnExport").onclick = exportWinners;
  $("btnMute").onclick = () => {
    const slider = $("volumeSlider");
    const next = Number(slider.value) === 0 ? Number(slider.dataset.previous || 70) : 0;
    if (next === 0) slider.dataset.previous = slider.value;
    setVolume(next);
  };
  $("volumeSlider").oninput = (event) => setVolume(Number(event.target.value));
}

function setVolume(volume) {
  const safe = Math.max(0, Math.min(100, Number(volume) || 0));
  $("volumeSlider").value = String(safe);
  $("volumeValue").textContent = `${safe}%`;
  $("btnMute").textContent = safe ? "🔊" : "🔇";
  $("btnMute").setAttribute("aria-label", safe ? "靜音抽獎音效" : "恢復抽獎音效");
  localStorage.setItem(VOLUME_KEY, String(safe));
  audio.setVolume(safe);
}

function restoreVolume() {
  const saved = Number(localStorage.getItem(VOLUME_KEY));
  setVolume(Number.isFinite(saved) ? saved : 70);
}

async function loadParticipants({ preserveMessage = false } = {}) {
  if (drawing) return false;
  $("btnDraw").disabled = true;
  $("btnReload").disabled = true;
  $("recordCount").textContent = "讀取中";
  $("participantCount").textContent = "讀取中";
  $("winnerCount").textContent = "—";
  if (!preserveMessage) setPoolMessage("正在彙整全部題目的答題者資料…");
  try {
    const questionSnap = await getDocs(collection(db, "questions"));
    const responseSnaps = await Promise.all(questionSnap.docs.map((questionDoc) =>
      getDocs(collection(db, "questions", questionDoc.id, "responses"))));
    const records = [];
    responseSnaps.forEach((responseSnap, index) => responseSnap.forEach((responseDoc) => {
      const data = responseDoc.data();
      records.push({ ...data, responseId: responseDoc.id, questionId: questionSnap.docs[index].id, createdAtMs: timestampOf(data.createdAt) });
    }));
    responseCount = records.length;
    participants = buildParticipantPool(records);
    const expected = Math.min(WINNER_COUNT, participants.length);
    $("recordCount").textContent = `${responseCount} 筆`;
    $("participantCount").textContent = `${participants.length} 位`;
    $("winnerCount").textContent = `${expected} 位`;
    $("btnDraw").disabled = participants.length === 0;
    if (!participants.length) setPoolMessage("目前沒有可供抽獎的答題者", true);
    else if (participants.length < WINNER_COUNT)
      setPoolMessage(`目前有效參與者不足 20 人，本次將抽出全部 ${participants.length} 人`);
    else setPoolMessage(`已讀取 ${responseCount} 筆答題紀錄，彙整為 ${participants.length} 位不重複有效參與者。`);
    return participants.length > 0;
  } catch (error) {
    console.error(error);
    participants = [];
    responseCount = 0;
    $("recordCount").textContent = "讀取失敗";
    $("participantCount").textContent = "讀取失敗";
    $("winnerCount").textContent = "—";
    setPoolMessage("無法讀取答題資料，請檢查網路或 Firebase 權限後重試。", true);
    return false;
  } finally {
    $("btnReload").disabled = false;
  }
}

function timestampOf(value) {
  return value?.toMillis?.() ?? Number(value?.seconds || 0) * 1000;
}
function setPoolMessage(message, isError = false) {
  $("poolMessage").textContent = message;
  $("poolMessage").classList.toggle("error", isError);
}

async function startDraw(isRedraw) {
  if (drawing) return;
  if (isRedraw && !confirm("確定要清除上一輪結果並重新抽獎嗎？不同輪次可能再次抽到相同參與者。")) return;
  drawing = true;
  setDrawingControls(true);
  audio.stop();
  if (isRedraw) clearResults();
  try {
    try { await audio.unlock(); } catch (error) { console.warn("Lottery audio unavailable; continuing silently.", error); }
    const loaded = await loadParticipantsForDraw();
    if (!loaded) return;
    winners = sampleParticipants(participants, WINNER_COUNT);
    drawStartedAt = new Date();
    $("introView").hidden = true;
    $("resultView").hidden = true;
    $("drawingView").hidden = false;
    $("drawStatus").textContent = "正在彙整所有答題者";
    $("drawCountdown").textContent = "5";
    try { audio.startDraw(DRAW_DURATION_MS); } catch (error) { console.warn("Draw music failed; continuing.", error); }
    await runDrawAnimation();
    try { audio.revealWinners(); } catch (error) { console.warn("Winner sound failed; continuing.", error); }
    showResults();
  } finally {
    drawing = false;
    setDrawingControls(false);
  }
}

async function loadParticipantsForDraw() {
  // Refresh immediately before every draw so late answers are included.
  $("recordCount").textContent = "讀取中";
  try {
    const questionSnap = await getDocs(collection(db, "questions"));
    const responseSnaps = await Promise.all(questionSnap.docs.map((q) => getDocs(collection(db, "questions", q.id, "responses"))));
    const records = [];
    responseSnaps.forEach((snap, i) => snap.forEach((doc) => {
      const data = doc.data();
      records.push({ ...data, responseId: doc.id, questionId: questionSnap.docs[i].id, createdAtMs: timestampOf(data.createdAt) });
    }));
    responseCount = records.length;
    participants = buildParticipantPool(records);
    $("recordCount").textContent = `${responseCount} 筆`;
    $("participantCount").textContent = `${participants.length} 位`;
    $("winnerCount").textContent = `${Math.min(WINNER_COUNT, participants.length)} 位`;
    if (!participants.length) {
      resetToIntro();
      setPoolMessage("目前沒有可供抽獎的答題者", true);
      return false;
    }
    return true;
  } catch (error) {
    console.error(error);
    resetToIntro();
    setPoolMessage("重新確認候選名單失敗，抽獎尚未執行，請稍後重試。", true);
    return false;
  }
}

function runDrawAnimation() {
  return new Promise((resolve) => {
    const startedAt = performance.now();
    const render = () => {
      const elapsed = performance.now() - startedAt;
      const left = Math.max(1, Math.ceil((DRAW_DURATION_MS - elapsed) / 1000));
      $("drawCountdown").textContent = elapsed >= 4000 ? String(Math.max(1, Math.ceil((DRAW_DURATION_MS - elapsed) / 334))) : String(left);
      $("drawStatus").textContent = elapsed < 1000 ? "正在彙整所有答題者" : elapsed < 4000 ? "公平隨機抽選中" : "即將公布完整得獎名單";
      if (!reducedMotion || elapsed % 500 < 120) {
        $("rollingNames").innerHTML = sampleParticipants(participants, Math.min(WINNER_COUNT, participants.length))
          .map((p) => `<span>${escapeHtml(p.nickname)}</span>`).join("");
      }
      if (elapsed >= DRAW_DURATION_MS) resolve();
      else requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  });
}

function setDrawingControls(busy) {
  $("btnDraw").disabled = busy || participants.length === 0;
  $("btnReload").disabled = busy;
  $("btnDrawAgain").disabled = busy;
}
function clearResults() {
  winners = [];
  drawStartedAt = null;
  $("winnerGrid").innerHTML = "";
  $("confetti").innerHTML = "";
  $("btnExport").disabled = true;
}
function resetToIntro() {
  $("resultView").hidden = true;
  $("drawingView").hidden = true;
  $("introView").hidden = false;
}

function showResults() {
  audio.stop();
  $("drawingView").hidden = true;
  $("resultView").hidden = false;
  $("resultMeta").textContent = `共 ${winners.length} 位幸運得主・${formatTaipei(drawStartedAt)}`;
  $("winnerGrid").classList.toggle("few-winners", winners.length < 12);
  $("winnerGrid").innerHTML = winners.map((winner, index) => `
    <article class="winner-card" style="--delay:${reducedMotion ? 0 : Math.min(index * 0.04, 0.76)}s">
      <span class="winner-rank">${String(index + 1).padStart(2, "0")}</span>
      <div><strong>${escapeHtml(winner.nickname)}</strong><small>完成 ${winner.answeredQuestions} 題作答</small></div>
    </article>`).join("");
  $("btnExport").disabled = false;
  if (!reducedMotion) createConfetti();
}

function createConfetti() {
  const colors = ["#f7b83d", "#f47f20", "#0d7655", "#3d99e8", "#e9419e", "#8d63d8"];
  $("confetti").innerHTML = Array.from({ length: 80 }, (_, index) =>
    `<i style="left:${randomInt(10000) / 100}%;background:${colors[index % colors.length]};--duration:${2.6 + randomInt(260) / 100}s;--delay:${randomInt(110) / 100}s;--drift:${randomInt(260) - 130}px;--rotation:${randomInt(360)}deg"></i>`).join("");
  setTimeout(() => ($("confetti").innerHTML = ""), 6500);
}

function formatTaipei(date, compact = false) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date).reduce((out, part) => ({ ...out, [part.type]: part.value }), {});
  return compact
    ? `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}`
    : `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}
function exportWinners() {
  if (!winners.length || !drawStartedAt) return;
  const csv = buildWinnersCsv(winners, drawStartedAt, formatTaipei);
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `lottery-winners-${formatTaipei(drawStartedAt, true)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function createLotteryAudio() {
  let context, master, musicTimer;
  let volume = 70;
  const notes = [261.63, 329.63, 392, 523.25, 659.25, 783.99, 1046.5];
  function setup() {
    if (context) return;
    context = new (window.AudioContext || window.webkitAudioContext)();
    master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -10; compressor.ratio.value = 8;
    master.connect(compressor); compressor.connect(context.destination); setMasterGain();
  }
  async function unlock() { setup(); if (context.state === "suspended") await context.resume(); }
  function setVolume(next) { volume = Math.max(0, Math.min(100, Number(next) || 0)); setMasterGain(); }
  function setMasterGain() { if (master && context) master.gain.setTargetAtTime(volume ? .78 * Math.pow(volume / 100, 1.45) : 0, context.currentTime, .04); }
  function tone(frequency, at, duration, gain = .12, type = "triangle") {
    const oscillator = context.createOscillator(), envelope = context.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, at);
    envelope.gain.setValueAtTime(.0001, at); envelope.gain.exponentialRampToValueAtTime(gain, at + .012); envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(envelope).connect(master); oscillator.start(at); oscillator.stop(at + duration + .03);
  }
  function startDraw(duration) {
    stop(); let beat = 0; const started = performance.now();
    const play = () => { if (!context || performance.now() - started >= duration - 80) return; const now = context.currentTime + .015; tone(notes[beat++ % notes.length], now, .13, .1, "triangle"); };
    play(); musicTimer = setInterval(play, 135); setTimeout(stop, duration - 30);
  }
  function stop() { clearInterval(musicTimer); musicTimer = null; }
  function revealWinners() {
    stop(); if (!context) return; const now = context.currentTime + .03;
    [261.63, 329.63, 392, 523.25, 659.25, 783.99].forEach((frequency, index) => tone(frequency, now + index * .07, 1, .12, "triangle"));
  }
  return { unlock, setVolume, startDraw, revealWinners, stop };
}
