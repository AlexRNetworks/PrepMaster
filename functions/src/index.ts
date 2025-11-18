import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendExpoPush } from './expoPush';

// Initialize admin SDK once
try {
  admin.initializeApp();
} catch {}

const db = admin.firestore();

// Types
interface PrepTask {
  id: number;
  name: string;
  qty: string;
  status: 'Incomplete' | 'Complete';
  notes: string;
  priority: 'high' | 'medium' | 'low';
  completedBy?: number;
  completedAt?: string;
  duration?: number;
}

interface PrepSchedule {
  id: number;
  date: string;
  primaryPrepPerson: number;
  additionalWorkers: number[];
  tasks: PrepTask[];
  createdBy: number;
  createdAt: string;
  notifications?: { completedPushedAt?: string };
}

function allTasksComplete(tasks: PrepTask[] | undefined) {
  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) return false;
  return tasks.every(t => t.status === 'Complete');
}

async function getAllPushTokens(): Promise<Array<{ userId: number; role: string; token: string }>> {
  const snap = await db.collection('pushTokens').get();
  const res: Array<{ userId: number; role: string; token: string }> = [];
  snap.forEach((d: FirebaseFirestore.QueryDocumentSnapshot) => {
    const data = d.data() as any;
    if (data?.token && typeof data?.userId === 'number') {
      res.push({ userId: data.userId, role: data.role || 'Employee', token: data.token });
    }
  });
  return res;
}

export const onScheduleWrite = (functions as any).firestore
  .document('schedules/{docId}')
  .onWrite(async (change: any, context: any) => {
    const before = change.before.exists ? (change.before.data() as PrepSchedule) : null;
    const after = change.after.exists ? (change.after.data() as PrepSchedule) : null;

    if (!after) return;

    const beforeComplete = before ? allTasksComplete(before.tasks) : false;
    const afterComplete = allTasksComplete(after.tasks);

    // Already completed previously or nothing changed to completed
    if (!afterComplete || beforeComplete) return;

    // Prevent duplicate notifications by checking marker
    const notifiedAt = after.notifications?.completedPushedAt;
    if (notifiedAt) return;

    // Mark as notified to avoid duplicates
    try {
      await change.after.ref.set({ notifications: { ...(after.notifications || {}), completedPushedAt: new Date().toISOString() } }, { merge: true });
    } catch (e) {
      console.error('Failed to set completedPushedAt', e);
    }

    // Build recipients: primary prep person + managers/admins
    const all = await getAllPushTokens();
    const tokens = new Set<string>();
    all.forEach(x => {
      if (x.userId === after.primaryPrepPerson || x.role === 'Manager' || x.role === 'IT_Admin') {
        tokens.add(x.token);
      }
    });

    const title = 'Prep Schedule Completed';
    const body = `${after.date} is finished`;
    const msgs = Array.from(tokens).map(to => ({ to, title, body }));
    if (msgs.length) await sendExpoPush(msgs);
  });

export const dailyDigest = (functions as any).pubsub
  .schedule('0 6 * * *')
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    // Build yesterday date string (yyyy-mm-dd)
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const day = `${yyyy}-${mm}-${dd}`;

    // Query all schedules for the day
    const snap = await db.collection('schedules').where('date', '==', day).get();
    let total = 0;
    let done = 0;
    let pending = 0;

  snap.forEach((ds: FirebaseFirestore.QueryDocumentSnapshot) => {
      const s = ds.data() as PrepSchedule;
      const tasks = s.tasks || [];
      total += tasks.length;
      done += tasks.filter(t => t.status === 'Complete').length;
    });
    pending = total - done;

    const rate = total > 0 ? Math.round((done / total) * 100) : 0;
    const title = 'Daily Prep Digest';
    const body = `${day}: ${done}/${total} done (${rate}%), pending ${pending}`;

    // Managers and Admins only
    const all = await getAllPushTokens();
    const tokens = new Set<string>();
    all.forEach(x => {
      if (x.role === 'Manager' || x.role === 'IT_Admin') tokens.add(x.token);
    });
    const msgs = Array.from(tokens).map(to => ({ to, title, body }));
    if (msgs.length) await sendExpoPush(msgs);

    return null;
  });

// --- Recurring schedule generation ---
interface TemplateTask {
  name: string;
  qty: string;
  priority: 'high' | 'medium' | 'low';
  notes?: string;
}

function toYyyyMmDd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function scheduleIdFromDateStr(day: string): number {
  return Number(day.replace(/-/g, ''));
}

export const generateUpcomingSchedules = (functions as any).pubsub
  .schedule('0 3 * * *')
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    // Load all active recurring rules
    const recurringSnap = await db.collection('recurringSchedules').where('active', '==', true).get();
    if (recurringSnap.empty) return null;

    const today = new Date();
    const baseDay = toYyyyMmDd(today);

    for (const doc of recurringSnap.docs) {
      const rule = doc.data() as any;
      const templateId = rule.templateId as string;
      const daysOfWeek: number[] = Array.isArray(rule.daysOfWeek) ? rule.daysOfWeek : [];
      if (!templateId || daysOfWeek.length === 0) continue;

      const assign = rule.assign || {};
      const primaryPrepPerson: number = assign.primaryPrepPerson;
      const additionalWorkers: number[] = Array.isArray(assign.additionalWorkers) ? assign.additionalWorkers : [];
      if (typeof primaryPrepPerson !== 'number') continue;

      const startDate: string = rule.startDate || baseDay;
      const endDate: string | null = rule.endDate || null;
      const tz: string = rule.timezone || 'America/Los_Angeles';
      void tz; // placeholder in case of future timezone-specific logic
      const ahead: number = Math.min(Number(rule.generateDaysAhead || 7), 30);

      // Load template
      const tplSnap = await db.collection('scheduleTemplates').doc(templateId).get();
      if (!tplSnap.exists) continue;
      const tpl = tplSnap.data() as any;
      const tplTasks: TemplateTask[] = Array.isArray(tpl.tasks) ? tpl.tasks : [];

      // Iterate days
      for (let i = 0; i <= ahead; i++) {
        const d = new Date();
        d.setDate(today.getDate() + i);
        const dayStr = toYyyyMmDd(d);
        if (dayStr < startDate) continue;
        if (endDate && dayStr > endDate) continue;
        const dow = d.getDay(); // 0..6
        if (!daysOfWeek.includes(dow)) continue;

        // Skip if schedule already exists for this date
        const existing = await db.collection('schedules').where('date', '==', dayStr).limit(1).get();
        if (!existing.empty) continue;

        // Build tasks
        const tasks: PrepTask[] = tplTasks.map((t, idx) => ({
          id: Date.now() + idx,
          name: String(t.name || ''),
          qty: String(t.qty || ''),
          status: 'Incomplete',
          notes: String(t.notes || ''),
          priority: (t.priority || 'medium') as any,
        }));

        const newSchedule: PrepSchedule = {
          id: scheduleIdFromDateStr(dayStr),
          date: dayStr,
          primaryPrepPerson,
          additionalWorkers,
          tasks,
          createdBy: Number(rule.createdBy || 0),
          createdAt: new Date().toISOString(),
        };

        // Create schedule
        await db.collection('schedules').add({
          ...newSchedule,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    return null;
  });

// --- Prep Forecasts ---
export { computePrepForecasts, computePrepForecastsNow } from './forecast';
