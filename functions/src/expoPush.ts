// Expo Push helper for Cloud Functions
// Sends messages in chunks to Expo push service

interface ExpoMessage { to: string; title: string; body: string }

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function sendExpoPush(messages: ExpoMessage[]) {
  const CHUNK = 90; // Expo allows up to 100; keep some headroom
  for (let i = 0; i < messages.length; i += CHUNK) {
    const batch = messages.slice(i, i + CHUNK);
    try {
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      });
    } catch (e) {
      // swallow and continue; best-effort
      console.error('Expo push send failed', e);
    }
  }
}
