import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyDmrzU3THFulnUxdmzR56dKnqKBY0pIBIo",
  authDomain: "melina-crm.firebaseapp.com",
  projectId: "melina-crm",
  storageBucket: "melina-crm.firebasestorage.app",
  messagingSenderId: "730484335539",
  appId: "1:730484335539:web:33ed818827082d6501a1c6"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
