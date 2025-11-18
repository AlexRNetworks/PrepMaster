import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

try {
  admin.initializeApp();
} catch {}

const db = admin.firestore();

type PrepLog = {
  scheduleId: number;
  scheduleDate: string; // yyyy-mm-dd
  taskId: number;
  taskName: string;
  qty?: string;
  action: 'prepared' | 'reverted' | 'wasted';
  userId: number;
  userName: string;
  createdAt?: FirebaseFirestore.Timestamp;
};

function parseNumericQty(qty?: string): number {
  if (!qty) return 1;
  const m = String(qty).trim().match(/([-+]?[0-9]*\.?[0-9]+)/);
  if (!m) return 1;
  const n = parseFloat(m[1]);
  return isNaN(n) ? 1 : n;
}

function toYyyyMmDd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function runCompute(): Promise<null> {
    const today = new Date();
    const lookbackDays = 28; // last 4 weeks
    const start = new Date();
    start.setDate(today.getDate() - lookbackDays);

    // Load prep logs for the lookback window
    const snap = await db
      .collection('prepLogs')
      .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(start))
      .get();

    if (snap.empty) return null;

    // Aggregate by itemName and weekday
    type Agg = { [item: string]: { byDow: number[]; total: number; count: number } };
    const agg: Agg = {} as any;

    snap.forEach((ds: FirebaseFirestore.QueryDocumentSnapshot) => {
      const log = ds.data() as PrepLog;
      if (log.action !== 'prepared') return;
      const qty = parseNumericQty(log.qty);
      const day = (log.createdAt?.toDate?.() || new Date(log.scheduleDate)).getDay();
      const key = (log.taskName || 'Unknown').trim();
      if (!agg[key]) agg[key] = { byDow: [0, 0, 0, 0, 0, 0, 0], total: 0, count: 0 };
      agg[key].byDow[day] += qty;
      agg[key].total += qty;
      agg[key].count += 1;
    });

    // Compute forecasts for next 7 days
    const outputs: Array<{ id: string; date: string; itemName: string; predictedQty: number; computedAt: FirebaseFirestore.FieldValue }>
      = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(today.getDate() + i);
      const dateStr = toYyyyMmDd(d);
      const dow = d.getDay();

      Object.entries(agg).forEach(([itemName, stats]) => {
        const weekdayQty = stats.byDow[dow];
        const weekdayAvg = weekdayQty; // already sums over window; approximate as total for that weekday
        const overallAvg = stats.count > 0 ? stats.total / stats.count : 0;
        // Blend: 70% weekday signal, 30% overall
        const pred = Math.max(0, Number(((weekdayAvg || 0) * 0.7 + overallAvg * 0.3).toFixed(2)));
        outputs.push({
          id: `${dateStr}__${itemName}`,
          date: dateStr,
          itemName,
          predictedQty: pred,
          computedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
    }

    // Write forecasts as upserts: collection prepForecasts, doc id `${date}__${itemName}`
    const batch = db.batch();
    outputs.forEach((o) => {
      const ref = db.collection('prepForecasts').doc(o.id);
      batch.set(ref, o, { merge: true });
    });
    await batch.commit();
    return null;
}

export const computePrepForecasts = (functions as any).pubsub
  // Nightly at 2:30 AM PT
  .schedule('30 2 * * *')
  .timeZone('America/Los_Angeles')
  .onRun(runCompute);

// Manual trigger for testing
export const computePrepForecastsNow = (functions as any).https.onRequest(async (_req: any, res: any) => {
  try {
    await runCompute();
    res.status(200).send('ok');
  } catch (e: any) {
    console.error(e);
    res.status(500).send(e?.message || 'error');
  }
});
