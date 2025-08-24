// src/firebase.ts（最小・そのまま使えます）
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore'

const firebaseConfig = {
  // ← Firebaseコンソールの config をコピペ
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
export const db = getFirestore(app)

// 圏外対応（IndexedDBに永続化）
enableIndexedDbPersistence(db).catch(() => {})
