"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.computePrepForecastsNow = exports.computePrepForecasts = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
try {
    admin.initializeApp();
}
catch { }
const db = admin.firestore();
function parseNumericQty(qty) {
    if (!qty)
        return 1;
    const m = String(qty).trim().match(/([-+]?[0-9]*\.?[0-9]+)/);
    if (!m)
        return 1;
    const n = parseFloat(m[1]);
    return isNaN(n) ? 1 : n;
}
function toYyyyMmDd(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}
async function runCompute() {
    const today = new Date();
    const lookbackDays = 28; // last 4 weeks
    const start = new Date();
    start.setDate(today.getDate() - lookbackDays);
    // Load prep logs for the lookback window
    const snap = await db
        .collection('prepLogs')
        .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(start))
        .get();
    if (snap.empty)
        return null;
    const agg = {};
    snap.forEach((ds) => {
        const log = ds.data();
        if (log.action !== 'prepared')
            return;
        const qty = parseNumericQty(log.qty);
        const day = (log.createdAt?.toDate?.() || new Date(log.scheduleDate)).getDay();
        const key = (log.taskName || 'Unknown').trim();
        if (!agg[key])
            agg[key] = { byDow: [0, 0, 0, 0, 0, 0, 0], total: 0, count: 0 };
        agg[key].byDow[day] += qty;
        agg[key].total += qty;
        agg[key].count += 1;
    });
    // Compute forecasts for next 7 days
    const outputs = [];
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
exports.computePrepForecasts = functions.pubsub
    // TEMP: run every 5 minutes for testing; revert to nightly later
    .schedule('*/5 * * * *')
    .timeZone('America/Los_Angeles')
    .onRun(runCompute);
// Manual trigger for testing
exports.computePrepForecastsNow = functions.https.onRequest(async (_req, res) => {
    try {
        await runCompute();
        res.status(200).send('ok');
    }
    catch (e) {
        console.error(e);
        res.status(500).send(e?.message || 'error');
    }
});
