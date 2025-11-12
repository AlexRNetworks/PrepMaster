import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  Alert, 
  SafeAreaView,
  Animated,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { useRouter } from 'expo-router';

import { useUser } from '@/context/UserContext';
import { db } from '@/lib/firebase';
import { addDoc, collection, getDocs, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import EmployeeDashboard from '@/components/EmployeeDashboard';
import UserManagement from '@/components/UserManagement';
import TaskAssignment from '@/components/TaskAssignment';
import PrepScheduleManager from '@/components/PrepScheduleManager';
import PrepDetailView from '@/components/PrepDetailView';



// --- TYPES ---
type UserRole = 'IT_Admin' | 'Manager' | 'Employee';
type Priority = 'high' | 'medium' | 'low';

interface User {
  id: number;
  name: string;
  pin: string;
  role: UserRole;
  permissions: string[];
  active: boolean;
  createdAt: string;
}

interface PrepTask {
  id: number;
  name: string;
  qty: string;
  status: 'Incomplete' | 'Complete';
  notes: string;
  priority: Priority;
  completedBy?: number;
  completedAt?: string;
}

interface PrepSchedule {
  id: number;
  date: string;
  primaryPrepPerson: number;
  additionalWorkers: number[];
  tasks: PrepTask[];
  createdBy: number;
  createdAt: string;
}

// --- INITIAL PREP SCHEDULES ---
const INITIAL_PREP_SCHEDULES: PrepSchedule[] = [
  {
    id: 1,
    date: new Date().toISOString().split('T')[0], // Today
    primaryPrepPerson: 2,
    additionalWorkers: [],
    tasks: [
      { id: 1, name: 'Slice 10 lbs Onions', qty: '10 lbs', status: 'Incomplete', notes: '', priority: 'high' },
      { id: 2, name: 'Make 2 Batches Ranch', qty: '2 batches', status: 'Complete', notes: 'Done', priority: 'medium', completedBy: 2 },
      { id: 3, name: 'Portion 2 cases Chicken', qty: '2 cases', status: 'Incomplete', notes: '', priority: 'high' },
    ],
    createdBy: 3,
    createdAt: new Date().toISOString(),
  },
];

export default function App() {
  const router = useRouter();
  const { setCurrentUser: setGlobalUser, setAllUsers: setGlobalUsers } = useUser();
  const [pin, setPin] = useState('');
  const [currentScreen, setCurrentScreen] = useState('Login');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [, setPrepSchedules] = useState<PrepSchedule[]>(INITIAL_PREP_SCHEDULES);
  const [selectedSchedule, setSelectedSchedule] = useState<PrepSchedule | null>(null);
  
  const fadeAnim = useState(() => new Animated.Value(0))[0];
  const scaleAnim = useState(() => new Animated.Value(0.9))[0];

  // Load users from Firestore
  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('id', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedUsers: User[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (typeof data.id === 'number') {
          loadedUsers.push({
            id: data.id,
            name: data.name || '',
            pin: data.pin || '',
            role: data.role || 'Employee',
            permissions: data.permissions || [],
            active: data.active !== false,
            createdAt: data.createdAt || new Date().toISOString(),
          });
        }
      });
      setUsers(loadedUsers);
      setGlobalUsers(loadedUsers);
    });

    return () => unsubscribe();
  }, [setGlobalUsers]);

  // Ensure IT Admin account (PIN 0000) exists and is locked to proper role/name/permissions
  useEffect(() => {
    const ensureItAdmin = async () => {
      if (!users) return;
      try {
        const usersCol = collection(db, 'users');
        // 1) If already have IT_Admin with PIN 0000, we're done
        const admin0000 = await getDocs(query(usersCol, where('role', '==', 'IT_Admin'), where('pin', '==', '0000')));
        if (!admin0000.empty) return;

        // 2) If an IT_Admin exists but with different PIN, normalize it
        const admins = await getDocs(query(usersCol, where('role', '==', 'IT_Admin')));
        if (!admins.empty) {
          const ref = admins.docs[0].ref;
          await updateDoc(ref, {
            pin: '0000',
            name: 'IT Administrator',
            permissions: ['assign_tasks', 'view_logs', 'edit_tasks', 'delete_tasks', 'manage_users', 'view_analytics', 'manage_permissions', 'system_settings'],
            active: true,
          });
          return;
        }

        // 3) If a user has PIN 0000 but wrong role, promote to IT_Admin
        const pin0000 = await getDocs(query(usersCol, where('pin', '==', '0000')));
        if (!pin0000.empty) {
          const ref = pin0000.docs[0].ref;
          await updateDoc(ref, {
            role: 'IT_Admin',
            name: 'IT Administrator',
            permissions: ['assign_tasks', 'view_logs', 'edit_tasks', 'delete_tasks', 'manage_users', 'view_analytics', 'manage_permissions', 'system_settings'],
            active: true,
          });
          return;
        }

        // 4) Otherwise create one. Prefer id=1 if it's free; else use next max+1
        const preferId = users.some(u => u.id === 1) ? Math.max(0, ...users.map(u => u.id)) + 1 : 1;
        await addDoc(usersCol, {
          id: preferId,
          name: 'IT Administrator',
          pin: '0000',
          role: 'IT_Admin',
          permissions: ['assign_tasks', 'view_logs', 'edit_tasks', 'delete_tasks', 'manage_users', 'view_analytics', 'manage_permissions', 'system_settings'],
          active: true,
          createdAt: new Date().toISOString(),
        });
      } catch {
        // ignore; app remains usable for other users
      }
    };
    ensureItAdmin();
  }, [users]);

  useEffect(() => {
    if (currentScreen === 'Login') {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 4,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [currentScreen, fadeAnim, scaleAnim]);

  const handleLogin = () => {
    if (pin.length !== 4) {
      Alert.alert("Invalid PIN", "Please enter exactly 4 digits.", [{ text: "OK" }]);
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      const user = users.find(u => u.pin === pin && u.active);
      
      if (user) {
        setCurrentUser(user);
        setGlobalUser(user); // Set in global context
        setGlobalUsers(users); // Set all users in global context
        
        if (user.role === 'IT_Admin' || user.role === 'Manager') {
          Alert.alert(
            "Login Successful",
            `Welcome ${user.name}! Where would you like to go?`,
            [
              {
                text: "Dashboard",
                onPress: () => setCurrentScreen('Dashboard'),
              },
              {
                text: "User Management",
                onPress: () => setCurrentScreen('UserManagement'),
              },
              {
                text: "Prep Schedule",
                onPress: () => setCurrentScreen('PrepScheduleManager'),
              },
            ]
          );
        } else {
          setCurrentScreen('Dashboard');
        }
      } else {
        Alert.alert(
          "Authentication Failed", 
          "The PIN you entered is incorrect or the account is inactive.",
          [{ text: "OK", onPress: () => setPin('') }]
        );
      }
      setIsLoading(false);
    }, 500);
  };

  const handleLogout = () => {
    Alert.alert(
      "Confirm Logout", 
      "Are you sure you want to log out?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Logout", 
          style: "destructive",
          onPress: () => {
            setCurrentScreen('Login');
            setCurrentUser(null);
            setGlobalUser(null); // Clear global context
            setPin('');
            setSelectedSchedule(null);
          }
        }
      ]
    );
  };

  const handlePinChange = (text: string) => {
    const numericText = text.replace(/[^0-9]/g, '');
    setPin(numericText);
  };

  const handleUpdateSchedule = (updatedSchedule: PrepSchedule) => {
    setPrepSchedules(prevSchedules =>
      prevSchedules.map(s => s.id === updatedSchedule.id ? updatedSchedule : s)
    );
    setSelectedSchedule(updatedSchedule);
  };

  // --- SCREEN ROUTING ---
  if (currentScreen === 'Dashboard' && currentUser) {
    return (
      <EmployeeDashboard 
        onLogout={handleLogout}
        currentUser={currentUser}
        onNavigateToUserManagement={() => setCurrentScreen('UserManagement')}
        onNavigateToPrepSchedule={() => router.push('/explore')}
      />
    );
  }

  if (currentScreen === 'UserManagement' && currentUser) {
    return (
      <UserManagement 
        currentUser={currentUser}
        onBack={() => setCurrentScreen('Dashboard')}
      />
    );
  }

  if (currentScreen === 'TaskAssignment' && currentUser) {
    return (
      <TaskAssignment 
        currentUser={currentUser}
        onBack={() => setCurrentScreen('Dashboard')}
        allUsers={users}
      />
    );
  }

  if (currentScreen === 'PrepScheduleManager' && currentUser) {
    return (
      <PrepScheduleManager 
        currentUser={currentUser}
        onBack={() => setCurrentScreen('Dashboard')}
        allUsers={users}
      />
    );
  }

  if (currentScreen === 'PrepDetailView' && currentUser && selectedSchedule) {
    return (
      <PrepDetailView 
        schedule={selectedSchedule}
        currentUser={currentUser}
        allUsers={users}
        onBack={() => setCurrentScreen('Dashboard')}
        onUpdateSchedule={handleUpdateSchedule}
      />
    );
  }

  // --- LOGIN SCREEN ---
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <Animated.View 
          style={[
            styles.loginCard,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }]
            }
          ]}
        >
          <View style={styles.logoContainer}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoIcon}>🍴</Text>
            </View>
            <Text style={styles.logoText}>PrepMaster Pro</Text>
            <Text style={styles.subtitleText}>Kitchen Management System</Text>
          </View>

          <View style={styles.formContainer}>
            <Text style={styles.promptText}>Enter Your PIN</Text>
            
            <View style={styles.pinContainer}>
              {[0, 1, 2, 3].map((index) => (
                <View 
                  key={index} 
                  style={[
                    styles.pinDot,
                    pin.length > index && styles.pinDotFilled
                  ]}
                />
              ))}
            </View>

            <TextInput
              style={styles.hiddenInput}
              onChangeText={handlePinChange}
              value={pin}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry={true}
              autoFocus={true}
              caretHidden={true}
            />

            <TouchableOpacity 
              style={[
                styles.loginButton,
                (pin.length !== 4 || isLoading) && styles.loginButtonDisabled
              ]}
              onPress={handleLogin}
              disabled={pin.length !== 4 || isLoading}
              activeOpacity={0.8}
            >
              <Text style={styles.loginButtonText}>
                {isLoading ? 'Authenticating...' : 'Login'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.clearButton}
              onPress={() => setPin('')}
            >
              <Text style={styles.clearButtonText}>Clear PIN</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footerText}>Secure access for authorized personnel</Text>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loginCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ff6b6b',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#ff6b6b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  logoIcon: {
    fontSize: 40,
  },
  logoText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#2c3e50',
    marginBottom: 4,
  },
  subtitleText: {
    fontSize: 14,
    color: '#7f8c8d',
    fontWeight: '500',
  },
  formContainer: {
    alignItems: 'center',
  },
  promptText: {
    fontSize: 18,
    marginBottom: 24,
    color: '#34495e',
    fontWeight: '600',
  },
  pinContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
    gap: 16,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ecf0f1',
    borderWidth: 2,
    borderColor: '#bdc3c7',
  },
  pinDotFilled: {
    backgroundColor: '#ff6b6b',
    borderColor: '#ff6b6b',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
  loginButton: {
    backgroundColor: '#2ecc71',
    paddingVertical: 16,
    paddingHorizontal: 60,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#2ecc71',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  loginButtonDisabled: {
    backgroundColor: '#95a5a6',
    shadowOpacity: 0,
    elevation: 0,
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  clearButton: {
    marginTop: 16,
    padding: 12,
  },
  clearButtonText: {
    color: '#7f8c8d',
    fontSize: 14,
    fontWeight: '600',
  },
  footerText: {
    textAlign: 'center',
    marginTop: 24,
    color: '#95a5a6',
    fontSize: 12,
  },
});