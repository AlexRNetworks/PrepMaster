// scripts/seedFirestore.js
// Run this once to initialize default users in Firestore.
// Usage: node scripts/seedFirestore.js

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, getDocs } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyAMqZzz5WIVPu1ieKJhpC1PLPa7CwkyRNw',
  authDomain: 'prepmaster-app-69964.firebaseapp.com',
  projectId: 'prepmaster-app-69964',
  storageBucket: 'prepmaster-app-69964.firebasestorage.app',
  messagingSenderId: '886820723111',
  appId: '1:886820723111:web:67c57a6f61758d5cc2be82',
  measurementId: 'G-SG3QVG5J23',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const defaultUsers = [
  {
    id: 1,
    name: 'IT Administrator',
    pin: '0000',
    role: 'IT_Admin',
    permissions: ['assign_tasks', 'view_logs', 'edit_tasks', 'delete_tasks', 'manage_users', 'view_analytics', 'manage_permissions', 'system_settings'],
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 2,
    name: 'John Doe',
    pin: '1234',
    role: 'Employee',
    permissions: [],
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 3,
    name: 'Sarah Manager',
    pin: '5678',
    role: 'Manager',
    permissions: ['assign_tasks', 'view_logs', 'edit_tasks', 'delete_tasks', 'manage_users', 'view_analytics'],
    active: true,
    createdAt: new Date().toISOString(),
  },
];

async function seedUsers() {
  try {
    console.log('Checking for existing users...');
    const usersSnapshot = await getDocs(collection(db, 'users'));
    
    if (!usersSnapshot.empty) {
      console.log(`Found ${usersSnapshot.size} existing users. Skipping seed.`);
      return;
    }

    console.log('Seeding default users...');
    for (const user of defaultUsers) {
      await addDoc(collection(db, 'users'), user);
      console.log(`✓ Added ${user.name}`);
    }
    console.log('✅ Seeding complete!');
  } catch (error) {
    console.error('❌ Error seeding users:', error);
  }
}

seedUsers();
