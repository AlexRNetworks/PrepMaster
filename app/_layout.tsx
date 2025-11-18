import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { LogBox } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { UserProvider, useUser } from '@/context/UserContext';
import { ThemeProviderLocal } from '@/context/ThemeContext';
import { LocaleProvider } from '@/context/LocaleContext';
import FloatingControls from '@/components/ui/FloatingControls';
import { initOfflineQueue, flushQueue } from '@/lib/offlineQueue';
import { registerUserPushToken, unscheduleDailyDigestLocal } from '@/lib/notifications';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';

export const unstable_settings = {
  anchor: '(tabs)',
};

// Suppress noisy Firestore permission errors
LogBox.ignoreLogs([
  'Uncaught Error in snapshot listener',
  'FirebaseError: [code=permission-denied]',
  '@firebase/firestore: Firestore',
]);

function NavThemeContainer() {
  const colorScheme = useColorScheme();
  const { currentUser } = useUser();

  React.useEffect(() => {
    initOfflineQueue();
    flushQueue();
  }, []);

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => { if (!user) { signInAnonymously(auth).catch(() => {}); } });
    if (!auth.currentUser) { signInAnonymously(auth).catch(() => {}); }
    return () => unsub();
  }, []);

  React.useEffect(() => {
    if (!currentUser) return;
    registerUserPushToken(currentUser.id, currentUser.role).catch(() => {});
    if (currentUser.role === 'Manager' || currentUser.role === 'IT_Admin') { unscheduleDailyDigestLocal().catch(() => {}); }
  }, [currentUser]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
      <FloatingControls />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <UserProvider>
      <ThemeProviderLocal>
        <LocaleProvider>
          <NavThemeContainer />
        </LocaleProvider>
      </ThemeProviderLocal>
    </UserProvider>
  );
}
