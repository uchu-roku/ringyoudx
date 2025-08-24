// src/firebase.ts
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  // 例: "ringyoudx.appspot.com"（← firebasestorage.app ではなく appspot.com）
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
export const db = getFirestore(app)

// オフライン永続化（複数タブや非対応ブラウザは握りつぶす）
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((e: any) => {
    // e.code === 'failed-precondition'（複数タブ）や 'unimplemented'（未対応）など
    console.warn('Persistence not enabled:', e?.code || e)
  })
}
