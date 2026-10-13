import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAv0CMx3yOmMfO2-xcG66pjZWu1B_khFJc",
  authDomain: "wisuda-lalaa.firebaseapp.com",
  projectId: "wisuda-lalaa",
  storageBucket: "wisuda-lalaa.firebasestorage.app",
  messagingSenderId: "366596153949",
  appId: "1:366596153949:web:7d4d66c242fd6c783b63b4"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);