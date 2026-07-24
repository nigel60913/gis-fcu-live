import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  initializeFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc,
  deleteDoc, onSnapshot, query, orderBy, serverTimestamp, writeBatch, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig, ADMIN_EMAILS } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
// 用長輪詢自動偵測：手機行動網路／某些校園或公司 WiFi 常會擋掉 Firestore 預設的
// 即時連線方式，導致「不刷新頁面就不會自動換題」。這個設定會自動改用相容性更好的
// 連線方式，修正這個問題。
export const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
export const auth = getAuth(app);

export {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp, writeBatch, increment,
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, ADMIN_EMAILS,
};
