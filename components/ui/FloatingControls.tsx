import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { useThemeLocal } from '@/context/ThemeContext';
import { useLocale } from '@/context/LocaleContext';
import { onQueueStatusChange } from '@/lib/offlineQueue';

export default function FloatingControls() {
  const { scheme, toggleScheme } = useThemeLocal();
  const { locale, toggleLocale } = useLocale();
  const [status, setStatus] = React.useState<{ isConnected: boolean; isFlushing: boolean; queueLength: number }>({ isConnected: true, isFlushing: false, queueLength: 0 });

  React.useEffect(() => {
    const unsub = onQueueStatusChange(s => setStatus({ isConnected: s.isConnected, isFlushing: s.isFlushing, queueLength: s.queueLength }));
    return () => unsub();
  }, []);

  return (
    <View pointerEvents="box-none" style={styles.container}>
      <View style={styles.stack}>
        {!status.isConnected && (
          <View style={[styles.banner, { backgroundColor: '#b91c1c' }]}> 
            <Text style={styles.bannerText}>Offline</Text>
          </View>
        )}
        {status.isConnected && status.queueLength > 0 && (
          <View style={[styles.banner, { backgroundColor: '#a16207' }]}> 
            <Text style={styles.bannerText}>{status.isFlushing ? 'Syncing…' : `Queued: ${status.queueLength}`}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', right: 12, bottom: Platform.select({ ios: 22, android: 22, default: 16 }), zIndex: 9999 },
  stack: { gap: 10, alignItems: 'flex-end' },
  banner: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#a16207', borderWidth: 1, borderColor: '#1f2937' },
  bannerText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  button: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#111827cc', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#1f2937' },
  buttonText: { color: '#ffffff', fontWeight: '800' },
});
