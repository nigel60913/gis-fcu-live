import assert from "node:assert/strict";
import { buildParticipantPool, sampleParticipants, buildWinnersCsv, normalizeNickname } from "../js/lottery-core.mjs";

const records = [
  { questionId: "q1", clientId: "a", nickname: " 王小明 " },
  { questionId: "q2", clientId: "a", nickname: "王小明" },
  { questionId: "q1", clientId: "b", nickname: "Same Name" },
  { questionId: "q2", clientId: "c", nickname: "Same Name" },
  { questionId: "q1", responseId: "", nickname: " Legacy  User " },
  { questionId: "q2", responseId: "", nickname: "legacy user" },
  { questionId: "q1", clientId: "loadtest_1", nickname: "LT1" },
  { questionId: "q1", clientId: "empty", nickname: "   " },
];
const pool = buildParticipantPool(records);
assert.equal(pool.length, 4, "ID-first dedupe retains same-name real participants and merges repeated answers");
assert.equal(pool.find((p) => p.clientId === "a").answeredQuestions, 2);
assert.equal(pool.filter((p) => p.nickname === "Same Name").length, 2);
assert.equal(normalizeNickname("  中 文\n名稱  "), "中 文 名稱");

for (const count of [0, 1, 19, 20, 25]) {
  const source = Array.from({ length: count }, (_, i) => ({ nickname: `P${i}`, clientId: `${i}` }));
  const sampled = sampleParticipants(source, 20, () => 0);
  assert.equal(sampled.length, Math.min(20, count));
  assert.equal(new Set(sampled.map((p) => p.clientId)).size, sampled.length);
}

const special = [{ nickname: ' 中文, "Winner"\nName ', clientId: "safe-id", answeredQuestions: 3 }];
const csv = buildWinnersCsv(special, new Date("2026-08-06T00:00:00Z"), () => "2026/08/06 08:00:00");
assert.ok(csv.startsWith("\uFEFF"));
assert.ok(csv.includes('" 中文, ""Winner""\nName "'));
assert.ok(csv.includes('"safe-id"'));
assert.ok(csv.includes('"2026/08/06 08:00:00"'));
console.log("lottery-core: all scenarios passed");
