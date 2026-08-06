export const WINNER_COUNT = 20;

export function normalizeNickname(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30);
}

export function isKnownSystemTestRecord(record) {
  const clientId = String(record.clientId || record.responseId || "").trim();
  const nickname = normalizeNickname(record.nickname);
  return /^loadtest_\d+$/i.test(clientId) || (/^LT\d+$/i.test(nickname) && /^loadtest_/i.test(clientId));
}

export function buildParticipantPool(records) {
  const byId = new Map();
  const legacyByNickname = new Map();

  for (const record of records) {
    const nickname = normalizeNickname(record.nickname);
    if (!nickname || isKnownSystemTestRecord(record)) continue;
    const clientId = String(record.clientId || record.responseId || "").trim().slice(0, 64);
    const key = nickname.toLocaleLowerCase("zh-TW");
    const target = clientId ? byId : legacyByNickname;
    const identity = clientId || key;
    const timestamp = Number(record.createdAtMs || 0);
    const existing = target.get(identity);

    if (!existing) {
      target.set(identity, {
        nickname,
        clientId,
        questionIds: new Set(record.questionId ? [record.questionId] : []),
        lastAnsweredAt: timestamp,
      });
    } else {
      if (record.questionId) existing.questionIds.add(record.questionId);
      if (timestamp >= existing.lastAnsweredAt) {
        existing.nickname = nickname;
        existing.lastAnsweredAt = timestamp;
      }
    }
  }

  return [...byId.values(), ...legacyByNickname.values()]
    .map((entry) => ({
      nickname: entry.nickname,
      clientId: entry.clientId,
      answeredQuestions: entry.questionIds.size,
      lastAnsweredAt: entry.lastAnsweredAt,
    }))
    .sort((a, b) => a.nickname.localeCompare(b.nickname, "zh-Hant"));
}

export function randomInt(max, getValues = (buffer) => crypto.getRandomValues(buffer)) {
  if (max <= 1) return 0;
  const range = 0x100000000;
  const limit = range - (range % max);
  const buffer = new Uint32Array(1);
  let value;
  do {
    getValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return value % max;
}

export function sampleParticipants(items, count, random = randomInt) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = random(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildWinnersCsv(winners, drawnAt, formatter) {
  const rows = [
    ["得獎序號", "得獎者名稱", "參與者識別碼", "完成或回答題數", "抽獎時間"],
    ...winners.map((winner, index) => [
      index + 1,
      winner.nickname,
      winner.clientId || "",
      winner.answeredQuestions,
      formatter(drawnAt),
    ]),
  ];
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
