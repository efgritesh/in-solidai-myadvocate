import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyDDrZjtxROSOOZYk6uUS76dCB_pl8Cc4cc",
  authDomain: "in-solidai-myadvocate.firebaseapp.com",
  projectId: "in-solidai-myadvocate",
  storageBucket: "in-solidai-myadvocate.firebasestorage.app",
  messagingSenderId: "86382052587",
  appId: "1:86382052587:web:66f2c37ee3609fb721aaae",
  measurementId: "G-D3XLWK923E"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
export const storage = getStorage(app);
export const functions = getFunctions(app, 'asia-south1');
export const googleProvider = new GoogleAuthProvider();

export default app;
