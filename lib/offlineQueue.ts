import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoSubscription } from '@react-native-community/netinfo';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

const STORAGE_KEY = 'offlineQueue:v1';

type FirestoreUpdate = { id: string; collection: string; docId: string; payload: Record<string, any>; op: 'update'; enqueuedAt: number };

let netUnsub: NetInfoSubscription | null = null;
let isFlushing = false;
let latestIsConnected = true;
const listeners = new Set<(s: { isConnected: boolean; isFlushing: boolean; queueLength: number; queuedDocIds: string[] }) => void>();

async function readQueue(): Promise<FirestoreUpdate[]> { try { const val = await AsyncStorage.getItem(STORAGE_KEY); return val ? (JSON.parse(val) as FirestoreUpdate[]) : []; } catch { return []; } }
async function writeQueue(items: FirestoreUpdate[]) { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }
function makeId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

async function getQueueSnapshot() {
  const items = await readQueue();
  return { isConnected: latestIsConnected, isFlushing, queueLength: items.length, queuedDocIds: Array.from(new Set(items.filter(i => i.collection === 'schedules').map(i => i.docId))) };
}
async function notify() { const snap = await getQueueSnapshot(); listeners.forEach(cb => { try { cb(snap); } catch {} }); }

export async function enqueueUpdate(collection: string, docId: string, payload: Record<string, any>) {
  const items = await readQueue(); items.push({ id: makeId(), collection, docId, payload, op: 'update', enqueuedAt: Date.now() }); await writeQueue(items); notify();
}

export async function flushQueue(): Promise<void> {
  if (isFlushing) return; isFlushing = true;
  try {
    const state = await NetInfo.fetch(); if (!state.isConnected) return;
    let items = await readQueue(); if (!items.length) return;
    const remaining: FirestoreUpdate[] = [];
    for (const it of items) { try { await updateDoc(doc(db, it.collection, it.docId), it.payload); } catch { remaining.push(it); } }
    await writeQueue(remaining);
  } finally { isFlushing = false; notify(); }
}

export function initOfflineQueue() {
  if (netUnsub) return;
  netUnsub = NetInfo.addEventListener(state => { latestIsConnected = !!state.isConnected; notify(); if (state.isConnected) { flushQueue(); } });
}

export async function isOnline(): Promise<boolean> { const state = await NetInfo.fetch(); return !!state.isConnected; }

export async function persistScheduleTasksUpdate(scheduleDocId: string, tasks: any) {
  if (!scheduleDocId) return; const online = await isOnline(); const payload = { tasks };
  if (online) { try { await updateDoc(doc(db, 'schedules', scheduleDocId), payload); } catch { await enqueueUpdate('schedules', scheduleDocId, payload); } }
  else { await enqueueUpdate('schedules', scheduleDocId, payload); }
}

export async function clearQueue() { await writeQueue([]); notify(); }
export function onQueueStatusChange(cb: (s: { isConnected: boolean; isFlushing: boolean; queueLength: number; queuedDocIds: string[] }) => void) { listeners.add(cb); getQueueSnapshot().then(cb).catch(() => {}); return () => { listeners.delete(cb); }; }
export async function getQueuedDocIds(): Promise<string[]> { const items = await readQueue(); return Array.from(new Set(items.filter(i => i.collection === 'schedules').map(i => i.docId))); }
