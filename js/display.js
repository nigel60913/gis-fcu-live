import { db, doc, collection, onSnapshot } from "./firebase.js";
import { escapeHtml, formatType } from "./utils.js";
import { bindNetworkStatus } from "./ui.js";
import { renderWordCloud, tallyWords } from "./wordcloud.js";
import { createDisplayAudio } from "./display-audio.js?v=2.8.1";
const screen = document.getElementById("screen"),
  displayTheme = document.getElementById("displayTheme"),
  sessionRef = doc(db, "session", "current");
let session = { state: "idle" },
  question = null,
  responses = [],
  uq,
  ur,
  wordCloudResize,
  timerTicker;
bindNetworkStatus();
const displayAudio = createDisplayAudio();
onSnapshot(sessionRef, (s) => {
  session = s.exists() ? s.data() : { state: "idle" };
  displayAudio.sync(session);
  load();
});
function load() {
  uq?.();
  ur?.();
  question = null;
  responses = [];
  if (!session.activeQuestionId) return idle();
  loading();
  uq = onSnapshot(doc(db, "questions", session.activeQuestionId), (s) => {
    if (!s.exists()) return idle();
    question = { id: s.id, ...s.data() };
    render();
  });
  ur = onSnapshot(
    collection(db, "questions", session.activeQuestionId, "responses"),
    (s) => {
      responses = s.docs.map((d) => d.data());
      render();
    },
  );
}
function audienceUrl() {
  return location.href.replace(/display\.html.*$/, "index.html");
}
function idle() {
  displayTheme.disabled = true;
  displayAudio.sync({ state: "lobby", activeQuestionId: null });
  screen.innerHTML = `<section class="esg-lobby"><div class="lobby-aurora" aria-hidden="true"><i></i><i></i><i></i></div><div class="lobby-grid" aria-hidden="true"></div><div class="lobby-orbit" aria-hidden="true"><i></i><i></i><i></i></div><header class="lobby-head"><div class="display-brand lobby-brand"><img class="brand-logo" src="assets/logo.png" alt="GIS.FCU"><span>ESG × MM<small>LIVE ENGAGEMENT</small></span></div><div class="lobby-status"><i></i><span>等待開始</span></div></header><div class="lobby-content"><div class="lobby-copy"><span class="lobby-kicker">TOGETHER FOR A BETTER FUTURE</span><h1>聽見聲音<br><em>Think Together</em></h1><p>活動即將開始，掃描 QR Code 加入即時互動，<br>和我們一起為永續未來發聲。</p><div class="esg-pillars"><article><b>E</b><span><strong>ENVIRONMENT</strong>環境永續</span></article><article><b>S</b><span><strong>SOCIAL</strong>社會共好</span></article><article><b>G</b><span><strong>GOVERNANCE</strong>責任治理</span></article></div></div><aside class="lobby-join"><div class="lobby-qr-frame"><div id="joinQr" class="join-qr"></div><span class="qr-corner qr-corner-a"></span><span class="qr-corner qr-corner-b"></span></div><span class="eyebrow">SCAN TO JOIN</span><h2>掃描加入活動</h2><p>${escapeHtml(audienceUrl())}</p><div class="join-pulse"><i></i><span>Live session is ready</span></div></aside></div><footer class="lobby-footer"><span>ESG × MM INTERACTIVE EXPERIENCE</span><span>活動即將開始</span></footer></section>`;
  if (window.QRCode) {
    const box = document.getElementById("joinQr");
    box.innerHTML = "";
    new QRCode(box, {
      text: audienceUrl(),
      width: 220,
      height: 220,
      colorDark: "#073B5C",
      colorLight: "#ffffff",
    });
  }
}
function loading() {
  displayTheme.disabled = false;
  screen.innerHTML =
    '<div class="display-loading"><span class="spinner"></span><p>正在載入題目</p></div>';
}
function shell(content) {
  displayTheme.disabled = false;
  const part = String(question.part || formatType(question.type)).replaceAll(
    "全員互動",
    "ESG × MM",
  );
  screen.innerHTML = `<header class="display-top"><div class="display-brand"><img class="brand-logo" src="assets/logo.png" alt="GIS.FCU"></div><div class="display-live-meta"><div class="voting-progress"><div class="progress"><i style="width:${Math.min(100, responses.length * 3)}%"></i></div><b>${responses.length} 票</b></div></div></header><section class="display-main"><span class="eyebrow">${escapeHtml(part)}</span><h1 class="display-title">${escapeHtml(question.title)}</h1><div class="display-results">${content}</div></section>`;
  syncDisplayTimer();
}
function timerMarkup() {
  return session.state === "live" && Number(session.timerEndsAt) > Date.now()
    ? '<div class="display-timer-stage"><div id="displayTimer" class="display-timer display-timer-large"><span id="displayTimerValue">--</span><small>秒後截止</small></div><p class="display-live-count">已有 ' +
        responses.length +
        " 人作答</p></div>"
    : "";
}
function syncDisplayTimer() {
  clearInterval(timerTicker);
  const timer = document.getElementById("displayTimer");
  if (!timer) return;
  const update = () => {
    const left = Math.max(
        0,
        Math.ceil((Number(session.timerEndsAt) - Date.now()) / 1000),
      ),
      total = Number(session.timerDuration) || 60,
      progress = Math.max(0, Math.min(1, left / total));
    document.getElementById("displayTimerValue").textContent = left;
    timer.style.setProperty("--timer-progress", `${progress * 360}deg`);
    timer.classList.toggle("urgent", left <= 10);
    if (left <= 0) {
      clearInterval(timerTicker);
      timer.classList.add("finished");
    }
  };
  update();
  timerTicker = setInterval(update, 250);
}
function render() {
  if (!question) return;
  displayAudio.sync(session);
  if (session.state === "lottery") return lottery();
  if (session.state === "live")
    return shell(
      `<div class="display-idle live-timer-view"><h2>投票進行中</h2>${timerMarkup()}${!timerMarkup() ? `<div class="big-number">${responses.length}</div><p class="muted">人已作答</p>` : ""}</div>`,
    );
  if (session.state === "locked")
    return shell(
      '<div class="display-idle"><h2>投票已截止</h2><p class="muted">準備公布結果…</p></div>',
    );
  if (session.state !== "closed")
    return shell('<div class="display-idle"><h2>準備開始</h2></div>');
  results();
}
function results() {
  const mode = question.revealMode || "results";
  if (mode === "fastest") return fastestResults();
  if (
    mode === "correctness" &&
    (Number.isInteger(question.correctIndex) ||
      Array.isArray(question.correctIndexes))
  )
    return correctnessResults();
  if (mode === "ranking" || question.type === "ranking")
    return rankingResults();
  const t = question.type;
  if (["wordcloud", "open"].includes(t)) return words();
  if (["slider", "rating"].includes(t)) return average();
  return bars();
}
function bars() {
  let opts = question.options || [];
  if (question.type === "emoji") opts = ["😍", "😊", "😐", "🤔", "😢"];
  if (question.type === "rating") opts = ["1", "2", "3", "4", "5"];
  if (question.type === "yesno" && opts.length < 2) opts = ["是", "否"];
  const counts = opts.map(() => 0);
  responses.forEach((r) => {
    const vals = Array.isArray(r.value) ? r.value : [r.value];
    vals.forEach((v) => {
      if (Number.isInteger(v) && counts[v] != null) counts[v]++;
    });
  });
  if (question.type === "ranking") {
    counts.fill(0);
    responses.forEach(
      (r) =>
        Array.isArray(r.value) &&
        r.value.forEach((v, i) => {
          if (counts[v] != null) counts[v] += opts.length - i;
        }),
    );
  }
  const max = Math.max(1, ...counts);
  shell(
    opts
      .map(
        (o, i) =>
          `<div class="bar-row ${i === question.correctIndex ? "correct" : ""}"><span>${escapeHtml(o)}</span><div class="bar-track"><div class="bar-fill" style="width:${(counts[i] / max) * 100}%"></div></div><b>${counts[i]}</b></div>`,
      )
      .join(""),
  );
}

function rankingResults() {
  const opts = question.options || [],
    totals = opts.map(() => 0),
    counts = opts.map(() => 0);
  responses.forEach((response) => {
    if (!Array.isArray(response.value)) return;
    const seen = new Set();
    response.value.forEach((optionIndex, position) => {
      const idx = Number(optionIndex);
      if (
        !Number.isInteger(idx) ||
        idx < 0 ||
        idx >= opts.length ||
        seen.has(idx)
      )
        return;
      seen.add(idx);
      totals[idx] += position + 1;
      counts[idx] += 1;
    });
  });
  const rows = opts
    .map((option, index) => ({
      option,
      index,
      avg: counts[index] ? totals[index] / counts[index] : Infinity,
      count: counts[index],
    }))
    .sort((a, b) => a.avg - b.avg || a.index - b.index);
  const valid = rows.filter((row) => Number.isFinite(row.avg));
  if (!valid.length)
    return shell('<div class="display-idle"><h2>尚無有效排序答案</h2></div>');
  const maxRank = Math.max(1, opts.length);
  shell(
    `<div class="ranking-board"><div class="result-kicker">大家的排序結果・${responses.length} 人參與</div>${valid
      .map((row, rank) => {
        const score = ((maxRank - row.avg + 1) / maxRank) * 100;
        return `<article class="ranking-result-row"><span class="ranking-result-rank">${rank + 1}</span><strong>${escapeHtml(row.option)}</strong><div class="ranking-result-track"><i style="width:${Math.max(8, score)}%"></i></div><b>平均順位 ${row.avg.toFixed(1)}</b></article>`;
      })
      .join("")}</div>`,
  );
}
function responseTime(response) {
  return (
    response.createdAt?.toMillis?.() ??
    (response.createdAt?.seconds || 0) * 1000
  );
}
function sameIndexSet(a, b) {
  const left = [...a].map(Number).sort((x, y) => x - y),
    right = [...b].map(Number).sort((x, y) => x - y);
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
function isCorrectResponse(response) {
  if (question.type === "multi")
    return (
      Array.isArray(response.value) &&
      Array.isArray(question.correctIndexes) &&
      sameIndexSet(response.value, question.correctIndexes)
    );
  if (["single", "quiz", "yesno"].includes(question.type))
    return (
      Number.isInteger(question.correctIndex) &&
      Number(response.value) === Number(question.correctIndex)
    );
  return false;
}
function fastestResults() {
  const ranked = responses
    .filter(isCorrectResponse)
    .sort((a, b) => responseTime(a) - responseTime(b))
    .slice(0, 5);
  if (!ranked.length)
    return shell('<div class="display-idle"><h2>還沒有人答對</h2></div>');
  shell(
    `<div class="fastest-board"><div class="result-kicker">最快答對</div>${ranked.map((response, index) => `<article class="fastest-row rank-${index + 1}"><span>${["🥇", "🥈", "🥉"][index] || index + 1}</span><strong>${escapeHtml(response.nickname || "訪客")}</strong><small>${responseTime(response) ? new Date(responseTime(response)).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""}</small></article>`).join("")}</div>`,
  );
}
function correctnessResults() {
  const options =
      question.type === "yesno" &&
      (!question.options || question.options.length < 2)
        ? ["是", "否"]
        : question.options || [],
    answerLabel =
      question.type === "multi" && Array.isArray(question.correctIndexes)
        ? question.correctIndexes
            .map((index) => options[Number(index)] ?? "")
            .filter(Boolean)
            .join("、")
        : (options[question.correctIndex] ?? ""),
    correct = responses.filter(isCorrectResponse).length,
    wrong = responses.length - correct,
    total = Math.max(1, responses.length);
  shell(
    `<div class="correctness-board"><div class="correct-answer-label"><span>正確答案</span><strong>${escapeHtml(answerLabel)}</strong></div><div class="correctness-grid"><article class="correct-card"><span>✓</span><strong>${correct}</strong><small>答對・${Math.round((correct / total) * 100)}%</small></article><article class="wrong-card"><span>×</span><strong>${wrong}</strong><small>答錯・${Math.round((wrong / total) * 100)}%</small></article></div></div>`,
  );
}
function average() {
  const nums = responses.map((r) => Number(r.value)).filter(Number.isFinite),
    avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
  shell(
    `<div class="display-idle"><span class="eyebrow">AVERAGE SCORE</span><div class="big-number">${avg.toFixed(1)}</div><p class="muted">共 ${nums.length} 份有效回答</p></div>`,
  );
}
function words() {
  const cloud = tallyWords(
    responses.flatMap((r) => (Array.isArray(r.value) ? r.value : [r.value])),
  );
  if (!cloud.length)
    return shell('<div class="display-idle"><h2>等待第一個答案</h2></div>');
  shell(
    '<canvas id="wordCloudCanvas" class="word-cloud-canvas" aria-label="即時文字雲"></canvas>',
  );
  const draw = () => {
    const canvas = document.getElementById("wordCloudCanvas");
    if (canvas) renderWordCloud(canvas, cloud);
  };
  (document.fonts?.ready || Promise.resolve()).then(() =>
    requestAnimationFrame(draw),
  );
  if (!wordCloudResize) {
    wordCloudResize = () => {
      clearTimeout(wordCloudResize.timer);
      wordCloudResize.timer = setTimeout(draw, 120);
    };
    addEventListener("resize", wordCloudResize);
  }
}
function lottery() {
  const pool = responses.filter((r) => r.nickname);
  if (!pool.length)
    return shell(
      '<div class="display-idle"><h2>還沒有可抽選的參與者</h2></div>',
    );
  const winner = pool[Math.floor(Math.random() * pool.length)];
  shell(
    `<div class="display-idle"><span class="eyebrow">LUCKY DRAW</span><p class="muted">恭喜本次幸運得主</p><div class="big-number">${escapeHtml(winner.nickname)}</div></div>`,
  );
}
