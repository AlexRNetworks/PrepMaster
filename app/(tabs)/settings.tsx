import React, { useState, useEffect } from 'react';
import { View, Text, Switch, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, SafeAreaView } from 'react-native';
import { useUser } from '@/context/UserContext';
import { useLocale } from '@/context/LocaleContext';
import { useThemeLocal } from '@/context/ThemeContext';
import NetInfo from '@react-native-community/netinfo';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { sendTestPushVerbose, unscheduleDailyDigestLocal, requestPushPermissionsAsync, getExpoPushTokenAsync, getExpoProjectId } from '@/lib/notifications';

export default function SettingsScreen() {
  const { currentUser } = useUser();
  const { t, locale, toggleLocale } = useLocale() as { t: (key: string) => string; locale: string; toggleLocale: () => void };
  const { scheme, toggleScheme } = useThemeLocal();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => { setOffline(!state.isConnected); });
    return () => unsubscribe();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Image source={{ uri: 'https://i.ibb.co/7tmLxCNZ/Purple-Minimalist-People-Profile-Logo-1.png' }} style={styles.logo} />
      </View>

      <View style={styles.content}>
        <Text style={styles.pageTitle}>{t('settings')}</Text>
        <Text style={styles.pageSubtitle}>{t('manageAppPreferences')}</Text>

        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <IconSymbol name="paintbrush.fill" size={20} color="#2563eb" style={{ marginRight: 12 }} />
              <Text style={styles.label}>{t('theme')}</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={toggleScheme} style={styles.optionButton}>
                <Text style={styles.optionButtonText}>{scheme === 'dark' ? 'Dark' : 'Light'}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.cardRow}>
              <IconSymbol name="globe" size={20} color="#2563eb" style={{ marginRight: 12 }} />
              <Text style={styles.label}>{t('language')}</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={toggleLocale} style={styles.optionButton}>
                <Text style={styles.optionButtonText}>{locale === 'en' ? 'English' : 'Español'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardRow}>
              <IconSymbol name="bell.fill" size={20} color="#2563eb" style={{ marginRight: 12 }} />
              <Text style={styles.label}>{t('pushNotifications')}</Text>
              <View style={{ flex: 1 }} />
              <Switch value={pushEnabled} onValueChange={setPushEnabled} trackColor={{ false: '#d1d5db', true: '#93c5fd' }} thumbColor={pushEnabled ? '#2563eb' : '#f3f4f6'} />
            </View>

            <TouchableOpacity
              style={styles.button}
              onPress={async () => {
                const perm = await requestPushPermissionsAsync();
                if (!perm) { Alert.alert('Permission Needed', 'Enable notifications for PrepMaster in system settings.'); return; }
                const res = await sendTestPushVerbose('Test ping from Settings');
                if (res.ok) { Alert.alert('Sent', 'Check your device for a test notification.'); }
                else { Alert.alert('Failed', `Could not send test push.\nReason: ${res.error || 'Unknown'}\nToken: ${res.token || 'none'}`); }
              }}
            >
              <Text style={styles.buttonText}>{t('sendTestNotification')}</Text>
            </TouchableOpacity>

            {(currentUser?.role === 'Manager' || currentUser?.role === 'IT_Admin') && (
              <TouchableOpacity
                style={styles.buttonSecondary}
                onPress={async () => { await unscheduleDailyDigestLocal(); Alert.alert('Cleaned', 'Removed locally scheduled daily digests on this device.'); }}
              >
                <Text style={styles.buttonTextSecondary}>{t('cleanUpDailyDigest')}</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.card}>
            <View style={styles.cardRow}>
              <IconSymbol name="qrcode" size={20} color="#2563eb" style={{ marginRight: 12 }} />
              <Text style={styles.label}>{t('pushToken')}</Text>
            </View>
            <TouchableOpacity
              style={styles.buttonSecondary}
              onPress={async () => { const token = await getExpoPushTokenAsync(); Alert.alert('Expo Push Token', token || 'No token'); }}
            >
              <Text style={styles.buttonTextSecondary}>{t('showMyExpoPushToken')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.buttonSecondary}
              onPress={async () => { const pid = getExpoProjectId(); Alert.alert('Expo Project ID', pid || 'No projectId detected'); }}
            >
              <Text style={styles.buttonTextSecondary}>{t('showExpoProjectId')}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <View style={styles.cardRow}>
              <IconSymbol name={offline ? 'wifi.slash' : 'wifi'} size={20} color={offline ? '#ef4444' : '#10b981'} style={{ marginRight: 12 }} />
              <Text style={styles.label}>{t('networkStatus')}</Text>
              <View style={{ flex: 1 }} />
              <Text style={{ color: offline ? '#ef4444' : '#10b981', fontWeight: '600', fontSize: 14 }}>{offline ? t('offline') : t('online')}</Text>
            </View>
          </View>

          {(currentUser?.role === 'Manager' || currentUser?.role === 'IT_Admin') && (
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <IconSymbol name="chart.bar.fill" size={20} color="#2563eb" style={{ marginRight: 12 }} />
                <Text style={styles.label}>{t('roleAnalytics')}</Text>
              </View>
              <Text style={styles.info}>{t('advancedAnalytics')}</Text>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  topBar: {
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#ffffff',
  },
  logo: { width: 50, height: 50, borderRadius: 10 },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20,
  },
  scrollContent: { flex: 1 },
  card: { backgroundColor: '#f9fafb', borderRadius: 12, marginBottom: 16, padding: 16 },
  cardRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  label: { fontSize: 15, fontWeight: '600', color: '#111827' },
  optionButton: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#2563eb' },
  optionButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  button: { marginTop: 8, paddingVertical: 12, borderRadius: 8, alignItems: 'center', backgroundColor: '#2563eb' },
  buttonText: { fontSize: 14, fontWeight: '600', color: '#ffffff' },
  buttonSecondary: { marginTop: 8, paddingVertical: 12, borderRadius: 8, alignItems: 'center', backgroundColor: '#f3f4f6' },
  buttonTextSecondary: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  info: { fontSize: 13, color: '#6b7280', marginTop: 8 },
});
