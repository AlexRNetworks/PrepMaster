import React, { createContext, useContext, useState, ReactNode } from 'react';

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
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  return (
    <UserContext.Provider value={{ currentUser, setCurrentUser, allUsers, setAllUsers }}>
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
