// Minimal Firebase app bootstrap for React Native/Expo
import { initializeApp, getApps, getApp } from "firebase/app";
// Do NOT import firebase/analytics in React Native (unsupported)

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAMqZzz5WIVPu1ieKJhpC1PLPa7CwkyRNw",
  authDomain: "prepmaster-app-69964.firebaseapp.com",
  projectId: "prepmaster-app-69964",
  storageBucket: "prepmaster-app-69964.firebasestorage.app",
  messagingSenderId: "886820723111",
  appId: "1:886820723111:web:67c57a6f61758d5cc2be82",
  measurementId: "G-SG3QVG5J23"
};

// Initialize (idempotent guard avoids duplicate-app errors in dev/hot reload)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export default app;