import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Firebase config — duplicated here for mobile app usage
const firebaseConfig = {
  apiKey: 'AIzaSyAMqZzz5WIVPu1ieKJhpC1PLPa7CwkyRNw',
  authDomain: 'prepmaster-app-69964.firebaseapp.com',
  projectId: 'prepmaster-app-69964',
  storageBucket: 'prepmaster-app-69964.firebasestorage.app',
  messagingSenderId: '886820723111',
  appId: '1:886820723111:web:67c57a6f61758d5cc2be82',
  measurementId: 'G-SG3QVG5J23',
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export default app;
