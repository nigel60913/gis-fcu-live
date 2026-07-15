// 輕量文字雲渲染器：依詞頻決定字級，橢圓螺旋式擺放＋輕微傾斜，讓外形更像一朵雲
// 不依賴外部套件，直接畫在 <canvas> 上

const PALETTE = ["#005490", "#2E7CB5", "#6FA8D6", "#AACD22", "#8FAE16", "#043A5E", "#7FB8DA"];
const TILTS = [0, 0, 0, -12, 12, -20, 20]; // 大部分維持水平，少數輕微傾斜，看起來比較有機

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

export function renderWordCloud(canvas, words) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || canvas.parentElement.clientWidth;
  const cssH = canvas.clientHeight || Math.round(cssW * 0.62);
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  if (!words.length) return;

  const maxCount = words[0].count;
  const minCount = words[words.length - 1].count;
  const maxFont = Math.min(78, cssW / 6);
  const minFont = Math.max(16, cssW / 46);

  const placed = [];
  const cx = cssW / 2, cy = cssH / 2;
  // 橢圓形擴散：橫向比縱向寬，整體外形比較像一朵扁一點的雲，而不是正圓
  const ellipseRatioX = 1.35;
  const ellipseRatioY = 0.82;

  words.forEach((w, i) => {
    const ratio = maxCount === minCount ? 1 : (w.count - minCount) / (maxCount - minCount);
    const fontSize = Math.round(minFont + ratio * (maxFont - minFont));
    ctx.font = `${i < 3 ? 800 : 700} ${fontSize}px 'Noto Sans TC', sans-serif`;
    const metrics = ctx.measureText(w.text);
    const textW = metrics.width;
    const textH = fontSize * 1.1;

    // 隨機挑一個傾斜角度（弧度），計算旋轉後的外接矩形當作碰撞用的保守邊界
    const tiltDeg = TILTS[Math.floor(Math.random() * TILTS.length)];
    const tiltRad = (tiltDeg * Math.PI) / 180;
    const cosT = Math.abs(Math.cos(tiltRad));
    const sinT = Math.abs(Math.sin(tiltRad));
    const boxW = textW * cosT + textH * sinT + 12;
    const boxH = textW * sinT + textH * cosT + 12;

    let angle = Math.random() * Math.PI * 2;
    let radius = 0;
    let x = cx, y = cy;
    let tries = 0;
    const step = 3.2;

    while (tries < 4000) {
      x = cx + radius * ellipseRatioX * Math.cos(angle) - boxW / 2;
      y = cy + radius * ellipseRatioY * Math.sin(angle) - boxH / 2;
      const box = { x, y, w: boxW, h: boxH };
      const overlaps = placed.some((p) => rectOverlap(box, p));
      const inBounds = x > 2 && y > 2 && x + boxW < cssW - 2 && y + boxH < cssH - 2;
      if (!overlaps && inBounds) break;
      angle += 0.32;
      radius += step * 0.14;
      tries++;
    }
    if (tries >= 4000) return; // 放不下就跳過（畫布太小或字太多）

    placed.push({ x, y, w: boxW, h: boxH });

    ctx.save();
    ctx.translate(x + boxW / 2, y + boxH / 2);
    ctx.rotate(tiltRad);
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(w.text, 0, 0);
    ctx.restore();
  });
}

function rectOverlap(a, b) {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}
