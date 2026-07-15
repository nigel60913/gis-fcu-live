// ============================================================
// 請到 Firebase 主控台 → 專案設定 → 一般 → 你的應用程式
// 複製 firebaseConfig 貼到這裡（詳見 README.md 第 2 步）
// ============================================================
export const firebaseConfig = {
  apiKey: "AIzaSyB81nz82vt4Cjyp3Lso2hgOVNFHvcp9A2k",
  authDomain: "test-ae77d.firebaseapp.com",
  projectId: "test-ae77d",
  storageBucket: "test-ae77d.firebasestorage.app",
  messagingSenderId: "641262268957",
  appId: "1:641262268957:web:d7353d152391df8eea0cf4",
};

// 主持人後台登入白名單：只有這些 Google 帳號可以進入後台管理題目
// 也可以改用 Firestore 的 admins collection，見 README.md 說明
export const ADMIN_EMAILS = [
  "nigel60913@gmail.com",
];
