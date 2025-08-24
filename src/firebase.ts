// src/firebase.ts（最小・そのまま使えます）
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyBFCXGOsvnc4-TN88J5ioV8H3MC0kvMiXg",
  authDomain: "ringyoudx.firebaseapp.com",
  projectId: "ringyoudx",
  storageBucket: "ringyoudx.firebasestorage.app",
  messagingSenderId: "529402072238",
  appId: "1:529402072238:web:c47cb5e83dd39175a5b13f"
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
export const db = getFirestore(app)

// 圏外対応（IndexedDBに永続化）
enableIndexedDbPersistence(db).catch(() => {})
