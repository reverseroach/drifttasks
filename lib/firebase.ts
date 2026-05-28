// lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyArnzUZF9nsXgpUfuHF5O7yjvHL2U_nsmQ",
  authDomain: "drift-tasks.firebaseapp.com",
  projectId: "drift-tasks",
  storageBucket: "drift-tasks.firebasestorage.app",
  messagingSenderId: "204377176723",
  appId: "1:204377176723:web:0a04da342b314f188f6b66",
  measurementId: "G-XQ779TH2N8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Export services
export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;