import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDqwHHr0f3b28ChjAi4WagYay77nka4seo",
  authDomain: "articpro-crm.firebaseapp.com",
  projectId: "articpro-crm",
  storageBucket: "articpro-crm.firebasestorage.app",
  messagingSenderId: "68457263634",
  appId: "1:68457263634:web:47eded0c9997b3d8089ecb"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };