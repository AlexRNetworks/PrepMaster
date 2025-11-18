import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';

type UserRole = 'IT_Admin' | 'Manager' | 'Employee';

interface User {
  id: number;
  name: string;
  pin: string;
  role: UserRole;
  permissions: string[];
  active: boolean;
  createdAt: string;
}

interface UserContextType {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  allUsers: User[];
  setAllUsers: (users: User[]) => void;
  usersLoaded: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);

  // Subscribe globally to users so all tabs see employees without visiting a specific screen first
  useEffect(() => {
    try {
      const q = query(collection(db, 'users'), orderBy('id', 'asc'));
      const unsub = onSnapshot(
        q,
        (snap) => {
          const next: User[] = [];
          snap.forEach((ds) => {
            const d = ds.data() as any;
            if (typeof d?.id !== 'number') return;
            next.push({
              id: d.id,
              name: String(d.name || ''),
              pin: String(d.pin || ''),
              role: (d.role || 'Employee') as User['role'],
              permissions: Array.isArray(d.permissions) ? d.permissions : [],
              active: d.active !== false,
              createdAt: d.createdAt || new Date().toISOString(),
            });
          });
          setAllUsers(next);
          setUsersLoaded(true);
        },
        () => { setAllUsers([]); setUsersLoaded(true); }
      );
      return () => unsub();
    } catch {
      // noop
    }
  }, []);

  return (
    <UserContext.Provider value={{ currentUser, setCurrentUser, allUsers, setAllUsers, usersLoaded }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
