// 改善文字雲手機操作：輸入文字後即可直接送出，不必先按「＋」。
// 使用事件委派，確保 audience.js 每次重繪表單後仍然有效。

document.addEventListener("input", (event) => {
  const input = event.target.closest?.("#wcInput");
  if (!input) return;

  const submitButton = document.getElementById("submitBtn");
  if (!submitButton) return;

  const hasTypedWord = input.value.trim().length > 0;
  const hasAddedWords = document.querySelectorAll("#wcChips [data-del]").length > 0;
  submitButton.disabled = !hasTypedWord && !hasAddedWords;
});

document.addEventListener(
  "click",
  (event) => {
    const submitButton = event.target.closest?.("#submitBtn");
    if (!submitButton) return;

    const input = document.getElementById("wcInput");
    if (!input || !input.value.trim()) return;

    // 在 audience.js 的送出事件執行前，先沿用原本的「＋」功能把文字加入答案。
    document.getElementById("wcAdd")?.click();
  },
  true,
);
