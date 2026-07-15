// 輕量文字雲渲染器：依詞頻決定字級，螺旋式擺放並偵測碰撞
// 不依賴外部套件，直接畫在 <canvas> 上

const PALETTE = ["#005490", "#2E7CB5", "#6FA8D6", "#AACD22", "#8FAE16", "#043A5E"];

function normalizeWord(raw) {
  return String(raw || "").trim().replace(/\s+/g, " ").slice(0, 24);
}

export function tallyWords(rawList) {
  const counts = new Map();
  for (const raw of rawList) {
    const w = normalizeWord(raw);
    if (!w) continue;
    const key = w.toLowerCase();
    if (!counts.has(key)) counts.set(key, { text: w, count: 0 });
    counts.get(key).count++;
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

export function renderWordCloud(canvas, words, opts = {}) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || canvas.parentElement.clientWidth;
  const cssH = canvas.clientHeight || Math.round(cssW * 0.62);
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);

  if (!words.length) return;

  const maxCount = words[0].count;
  const minCount = words[words.length - 1].count;
  const maxFont = Math.min(64, cssW / 7);
  const minFont = Math.max(15, cssW / 42);

  const placed = [];
  const cx = cssW / 2, cy = cssH / 2;

  words.forEach((w, i) => {
    const ratio = maxCount === minCount ? 1 : (w.count - minCount) / (maxCount - minCount);
    const fontSize = Math.round(minFont + ratio * (maxFont - minFont));
    ctx.font = `${i < 3 ? 800 : 700} ${fontSize}px 'Noto Sans TC', sans-serif`;
    const metrics = ctx.measureText(w.text);
    const boxW = metrics.width + 10;
    const boxH = fontSize * 1.15;

    let angle = Math.random() * Math.PI * 2;
    let radius = 0;
    let x = cx, y = cy;
    let tries = 0;
    const step = 4;

    while (tries < 3000) {
      x = cx + radius * Math.cos(angle) - boxW / 2;
      y = cy + radius * Math.sin(angle) - boxH / 2;
      const box = { x, y, w: boxW, h: boxH };
      const overlaps = placed.some(p => rectOverlap(box, p));
      const inBounds = x > 4 && y > fontSize * 0.3 && x + boxW < cssW - 4 && y + boxH < cssH - 4;
      if (!overlaps && inBounds) break;
      angle += 0.35;
      radius += step * 0.12;
      tries++;
    }
    if (tries >= 3000) return; // 放不下就跳過（畫布太小）

    placed.push({ x, y, w: boxW, h: boxH });
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    ctx.textBaseline = "top";
    ctx.fillText(w.text, x + 5, y + boxH * 0.08);
  });
}

function rectOverlap(a, b) {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}
