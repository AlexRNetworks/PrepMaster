import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

export async function requestPushPermissionsAsync() {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') { const { status } = await Notifications.requestPermissionsAsync(); finalStatus = status; }
  if (finalStatus !== 'granted') return null;
  return true;
}

export async function getExpoPushTokenAsync(): Promise<string | null> {
  try {
    const projectId = (Constants as any)?.expoConfig?.extra?.eas?.projectId || (Constants as any)?.easConfig?.projectId || undefined;
    const token = projectId ? await Notifications.getExpoPushTokenAsync({ projectId }) : await Notifications.getExpoPushTokenAsync();
    return token.data ?? null;
  } catch { return null; }
}

export function getExpoProjectId(): string | undefined {
  const projectId = (Constants as any)?.expoConfig?.extra?.eas?.projectId || (Constants as any)?.easConfig?.projectId || undefined;
  return projectId;
}

export async function registerUserPushToken(userId: number, role: string) {
  const ok = await requestPushPermissionsAsync();
  if (!ok) return null;
  const token = await getExpoPushTokenAsync();
  if (!token) return null;
  await setDoc(doc(db, 'pushTokens', String(userId)), { userId, role, token, platform: Platform.OS, updatedAt: new Date().toISOString() }, { merge: true });
  return token;
}

export async function scheduleLocalNotification(title: string, body: string) {
  return Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null });
}

export async function scheduleDailyDigestLocal(hour = 6, minute = 0) {
  return Notifications.scheduleNotificationAsync({ content: { title: 'Daily Digest', body: 'Prep summary is ready. Open Logs to review yesterday’s progress.' }, trigger: { type: Notifications.SchedulableTriggerInputTypes.CALENDAR, hour, minute, repeats: true } });
}

export async function unscheduleDailyDigestLocal() {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled as any[]) { if (n?.content?.title === 'Daily Digest' && n?.identifier) { await Notifications.cancelScheduledNotificationAsync(n.identifier as string); } }
  } catch {}
}

async function sendExpoPush(messages: { to: string; title: string; body: string }[]) {
  try { await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(messages) }); } catch {}
}

async function sendExpoPushWithResponse(messages: { to: string; title: string; body: string }[]) {
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(messages) });
    const json = await res.json().catch(() => null as any);
    const first = json?.data?.[0];
    if (first?.status === 'ok') return { ok: true } as const;
    const errText = first?.message || first?.details?.error || 'Unknown push error';
    return { ok: false, error: errText } as const;
  } catch (e: any) { return { ok: false, error: String(e?.message || e) } as const; }
}

async function getAllPushTokens(): Promise<{ userId: number; role: string; token: string }[]> {
  const snap = await getDocs(collection(db, 'pushTokens'));
  const res: { userId: number; role: string; token: string }[] = [];
  snap.forEach(d => { const data = d.data() as any; if (data?.token && typeof data?.userId === 'number') { res.push({ userId: data.userId, role: data.role || 'Employee', token: data.token }); } });
  return res;
}

export async function sendScheduleCompletionPush(args: { date: string; completedByName: string; primaryPrepPerson: number }) {
  const { date, completedByName, primaryPrepPerson } = args;
  const all = await getAllPushTokens();
  const tokens = new Set<string>();
  all.forEach(x => { if (x.userId === primaryPrepPerson || x.role === 'Manager' || x.role === 'IT_Admin') { tokens.add(x.token); } });
  const title = 'Prep Schedule Completed';
  const body = `${date} finished by ${completedByName}`;
  const msgs = Array.from(tokens).map(to => ({ to, title, body }));
  if (msgs.length) await sendExpoPush(msgs);
}

export async function sendTestPush(body = 'This is a test notification') {
  const token = await getExpoPushTokenAsync();
  if (!token) return false;
  const title = 'PrepMaster Test';
  try { await sendExpoPush([{ to: token, title, body }]); return true; } catch { return false; }
}

export async function sendTestPushVerbose(body = 'This is a test notification') {
  const token = await getExpoPushTokenAsync();
  if (!token) return { ok: false as const, error: 'No Expo push token. Ensure physical device and Expo Go login.', token: null };
  const title = 'PrepMaster Test';
  const res = await sendExpoPushWithResponse([{ to: token, title, body }]);
  return { ...res, token };
}
