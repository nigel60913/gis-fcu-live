// 產生／取得裝置端唯一識別碼，用來讓同一支手機在同一題只能算一次作答（可修改答案）
export function getClientId() {
  let id = localStorage.getItem("gisfcu_client_id");
  if (!id) {
    id = "c_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem("gisfcu_client_id", id);
  }
  return id;
}

export function getNickname() {
  return localStorage.getItem("gisfcu_nickname") || "";
}
export function setNickname(name) {
  localStorage.setItem("gisfcu_nickname", name.trim().slice(0, 12));
}

export function showToast(msg, ms = 2200) {
  let el = document.getElementById("__toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "__toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  requestAnimationFrame(() => el.classList.add("show"));
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), ms);
}

export const TYPE_LABEL = {
  wordcloud: "文字雲",
  single: "單選投票",
  multi: "複選投票",
  ranking: "排名",
  quiz: "猜答案搶答",
};

export const TYPE_ICON = {
  wordcloud: "☁️",
  single: "☑️",
  multi: "▤",
  ranking: "🏆",
  quiz: "⚡",
};

export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// 簡單防抖
export function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}
