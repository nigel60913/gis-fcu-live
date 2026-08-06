import {
  db,
  auth,
  collection,
  getDocs,
  onAuthStateChanged,
  ADMIN_EMAILS,
} from "./firebase.js";
import { escapeHtml } from "./utils.js";
import { bindNetworkStatus } from "./ui.js";

const WINNER_COUNT = 20;
const DRAW_DURATION_MS = 5000;
const STORAGE_KEY = "gisfcu_latest_lottery_winners";
const VOLUME_KEY = "gisfcu_lottery_volume";
const $ = (id) => document.getElementById(id);

let participants = [];
let winners = [];
let drawStartedAt = null;
let drawing = false;
let pageBooted = false;

bindNetworkStatus();
const audio = createLotteryAudio();
restoreVolume();

onAuthStateChanged(auth, async (user) => {
  const allowed =
    user && (ADMIN_EMAILS.length === 0 || ADMIN_EMAILS.includes(user.email));
  if (!allowed) {
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
  if (pageBooted) return;
  pageBooted = true;
  wireEvents();
  restoreLatestDraw();
  await loadParticipants();
});

function wireEvents() {
  $("btnDraw").onclick = startDraw;
  $("btnReload").onclick = loadParticipants;
  $("btnDrawAgain").onclick = resetToIntro;
  $("btnExport").onclick = exportWinners;
  $("volumeSlider").oninput = (event) => {
    const volume = Number(event.target.value);
    $("volumeValue").textContent = `${volume}%`;
    localStorage.setItem(VOLUME_KEY, String(volume));
    audio.setVolume(volume);
  };
}

function restoreVolume() {
  const saved = Number(localStorage.getItem(VOLUME_KEY));
  const volume = Number.isFinite(saved) ? Math.max(0, Math.min(100, saved)) : 70;
  $("volumeSlider").value = String(volume);
  $("volumeValue").textContent = `${volume}%`;
  audio.setVolume(volume);
}

async function loadParticipants() {
  if (drawing) return;
  const button = $("btnDraw");
  button.disabled = true;
  $("participantCount").textContent = "讀取中";
  setPoolMessage("正在彙整全部題目的答題者資料…");

  try {
    const questionSnap = await getDocs(collection(db, "questions"));
    const questionDocs = questionSnap.docs;
    const responseSnaps = await Promise.all(
      questionDocs.map((questionDoc) =>
        getDocs(collection(db, "questions", questionDoc.id, "responses")),
      ),
    );
    const byNickname = new Map();

    responseSnaps.forEach((responseSnap, questionIndex) => {
      const questionId = questionDocs[questionIndex]?.id || "";
      responseSnap.forEach((responseDoc) => {
        const data = responseDoc.data();
        const nickname = normalizeNickname(data.nickname);
        if (!nickname) return;
        const nicknameKey = nickname.toLocaleLowerCase("zh-TW");
        const timestamp = timestampOf(data.createdAt);
        const clientId = String(data.clientId || responseDoc.id || "");
        const existing = byNickname.get(nicknameKey);
        if (!existing) {
          byNickname.set(nicknameKey, {
            nickname,
            clientId,
            clientIds: new Set(clientId ? [clientId] : []),
            questionIds: new Set(questionId ? [questionId] : []),
            lastAnsweredAt: timestamp,
          });
          return;
        }
        if (clientId) existing.clientIds.add(clientId);
        if (questionId) existing.questionIds.add(questionId);
        if (timestamp > existing.lastAnsweredAt) {
          existing.lastAnsweredAt = timestamp;
          existing.clientId = clientId || existing.clientId;
          existing.nickname = nickname;
        }
      });
    });

    participants = [...byNickname.values()]
      .map((participant) => ({
        nickname: participant.nickname,
        clientId: participant.clientId,
        clientIds: [...participant.clientIds],
        answeredQuestions: participant.questionIds.size,
        lastAnsweredAt: participant.lastAnsweredAt,
      }))
      .sort((a, b) => a.nickname.localeCompare(b.nickname, "zh-Hant"));

    $("participantCount").textContent = `${participants.length} 位`;
    button.disabled = participants.length === 0;
    if (!participants.length) {
      setPoolMessage("目前尚未找到答題者，請確認前面題目已有觀眾送出答案。", true);
    } else if (participants.length < WINNER_COUNT) {
      setPoolMessage(
        `目前共有 ${participants.length} 位不重複答題者；因不足 20 位，本次將全部列為得獎者。`,
      );
    } else {
      setPoolMessage(
        `已從 ${questionDocs.length} 題中彙整 ${participants.length} 位不重複答題者，可以開始抽獎。`,
      );
    }
  } catch (error) {
    console.error(error);
    participants = [];
    $("participantCount").textContent = "讀取失敗";
    setPoolMessage("無法讀取答題資料，請檢查網路或 Firebase 權限後重試。", true);
  }
}

function normalizeNickname(value) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30);
}

function timestampOf(value) {
  return value?.toMillis?.() ?? Number(value?.seconds || 0) * 1000;
}

function setPoolMessage(message, isError = false) {
  const element = $("poolMessage");
  element.textContent = message;
  element.classList.toggle("error", isError);
}

async function startDraw() {
  if (drawing) return;
  await audio.unlock();
  if (!participants.length) await loadParticipants();
  if (!participants.length) return;

  drawing = true;
  winners = secureSample(participants, Math.min(WINNER_COUNT, participants.length));
  drawStartedAt = new Date();
  $("introView").hidden = true;
  $("resultView").hidden = true;
  $("drawingView").hidden = false;
  $("drawCountdown").textContent = "5";
  audio.startDraw(DRAW_DURATION_MS);

  let rollingTimer;
  let countdownTimer;
  const renderRolling = () => {
    const rolling = secureSample(participants, Math.min(WINNER_COUNT, participants.length));
    $("rollingNames").innerHTML = rolling
      .map((participant) => `<span>${escapeHtml(participant.nickname)}</span>`)
      .join("");
  };
  const updateCountdown = () => {
    const elapsed = performance.now() - startedAt;
    const left = Math.max(1, Math.ceil((DRAW_DURATION_MS - elapsed) / 1000));
    $("drawCountdown").textContent = String(left);
  };
  const startedAt = performance.now();
  renderRolling();
  rollingTimer = window.setInterval(renderRolling, 115);
  countdownTimer = window.setInterval(updateCountdown, 100);

  window.setTimeout(() => {
    window.clearInterval(rollingTimer);
    window.clearInterval(countdownTimer);
    audio.revealWinners();
    showResults();
    drawing = false;
  }, DRAW_DURATION_MS);
}

function secureRandomInt(max) {
  if (max <= 1) return 0;
  const range = 0x100000000;
  const limit = range - (range % max);
  const buffer = new Uint32Array(1);
  let value;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return value % max;
}

function secureSample(items, count) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = secureRandomInt(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled.slice(0, count);
}

function showResults() {
  $("drawingView").hidden = true;
  $("resultView").hidden = false;
  $("resultMeta").textContent = `共 ${winners.length} 位幸運得主・${drawStartedAt.toLocaleString("zh-TW")}`;
  $("winnerGrid").innerHTML = winners
    .map(
      (winner, index) => `
        <article class="winner-card" style="--delay:${Math.min(index * 0.055, 1.05)}s">
          <span class="winner-rank">${String(index + 1).padStart(2, "0")}</span>
          <div>
            <strong>${escapeHtml(winner.nickname)}</strong>
            <small>完成 ${winner.answeredQuestions} 題作答</small>
          </div>
        </article>`,
    )
    .join("");
  createConfetti();
  persistLatestDraw();
}

function resetToIntro() {
  $("resultView").hidden = true;
  $("drawingView").hidden = true;
  $("introView").hidden = false;
  $("confetti").innerHTML = "";
  loadParticipants();
}

function createConfetti() {
  const container = $("confetti");
  const colors = ["#f7b83d", "#f47f20", "#0d7655", "#3d99e8", "#e9419e", "#8d63d8"];
  container.innerHTML = Array.from({ length: 120 }, (_, index) => {
    const left = secureRandomInt(10000) / 100;
    const duration = 2.6 + secureRandomInt(260) / 100;
    const delay = secureRandomInt(110) / 100;
    const drift = `${secureRandomInt(260) - 130}px`;
    const rotation = `${secureRandomInt(360)}deg`;
    const color = colors[index % colors.length];
    return `<i style="left:${left}%;background:${color};--duration:${duration}s;--delay:${delay}s;--drift:${drift};--rotation:${rotation}"></i>`;
  }).join("");
  window.setTimeout(() => (container.innerHTML = ""), 6500);
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function exportWinners() {
  if (!winners.length) return;
  const rows = [
    ["得獎序號", "得獎者暱稱", "完成題數", "抽獎時間", "識別碼"],
    ...winners.map((winner, index) => [
      index + 1,
      winner.nickname,
      winner.answeredQuestions,
      drawStartedAt?.toLocaleString("zh-TW") || "",
      winner.clientId || "",
    ]),
  ];
  const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ESG-MM-得獎名單-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function persistLatestDraw() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        drawStartedAt: drawStartedAt?.toISOString() || new Date().toISOString(),
        winners,
      }),
    );
  } catch (error) {
    console.warn("Unable to persist lottery result", error);
  }
}

function restoreLatestDraw() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved?.winners?.length) return;
    winners = saved.winners;
    drawStartedAt = new Date(saved.drawStartedAt);
  } catch (error) {
    console.warn("Unable to restore lottery result", error);
  }
}

function createLotteryAudio() {
  let context;
  let master;
  let musicTimer;
  let volume = 70;
  const notes = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99, 1046.5];

  function setup() {
    if (context) return;
    context = new (window.AudioContext || window.webkitAudioContext)();
    master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -10;
    compressor.knee.value = 8;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;
    master.connect(compressor);
    compressor.connect(context.destination);
    setMasterGain();
  }

  async function unlock() {
    setup();
    if (context.state === "suspended") await context.resume();
  }

  function setVolume(nextVolume) {
    volume = Math.max(0, Math.min(100, Number(nextVolume) || 0));
    setMasterGain();
  }

  function setMasterGain() {
    if (!master || !context) return;
    const gain = volume === 0 ? 0 : 0.78 * Math.pow(volume / 100, 1.45);
    master.gain.setTargetAtTime(gain, context.currentTime, 0.04);
  }

  function tone(frequency, at, duration, gain = 0.12, type = "triangle") {
    const osc = context.createOscillator();
    const envelope = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, at);
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(gain, at + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(envelope).connect(master);
    osc.start(at);
    osc.stop(at + duration + 0.03);
  }

  function noise(at, duration, gain = 0.08) {
    const size = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, size, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < size; index += 1) data[index] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = buffer;
    filter.type = "highpass";
    filter.frequency.value = 1700;
    envelope.gain.setValueAtTime(gain, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter).connect(envelope).connect(master);
    source.start(at);
  }

  function startDraw(durationMs) {
    clearInterval(musicTimer);
    let beat = 0;
    const startedAt = performance.now();
    const playBeat = () => {
      if (!context || performance.now() - startedAt >= durationMs - 80) return;
      const now = context.currentTime + 0.015;
      const elapsed = performance.now() - startedAt;
      const progress = Math.min(1, elapsed / durationMs);
      const note = notes[(beat + Math.floor(progress * 3)) % notes.length];
      tone(note, now, 0.13, 0.095 + progress * 0.035, beat % 4 === 0 ? "square" : "triangle");
      tone(98 + (beat % 3) * 16, now, 0.075, 0.07, "sine");
      if (beat % 4 === 0) noise(now, 0.055, 0.035);
      beat += 1;
    };
    playBeat();
    musicTimer = window.setInterval(playBeat, 135);
    window.setTimeout(() => clearInterval(musicTimer), durationMs - 30);
  }

  function revealWinners() {
    clearInterval(musicTimer);
    if (!context) return;
    const now = context.currentTime + 0.03;
    noise(now, 0.65, 0.14);
    [261.63, 329.63, 392.0, 523.25].forEach((frequency, index) =>
      tone(frequency, now + index * 0.045, 1.25, 0.13, "triangle"),
    );
    [659.25, 783.99, 1046.5].forEach((frequency, index) =>
      tone(frequency, now + 0.34 + index * 0.09, 0.82, 0.11, "sine"),
    );
    window.setTimeout(() => {
      const later = context.currentTime + 0.02;
      [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) =>
        tone(frequency, later + index * 0.055, 1.1, 0.1, "triangle"),
      );
    }, 650);
  }

  return { unlock, setVolume, startDraw, revealWinners };
}
