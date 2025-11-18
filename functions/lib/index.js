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
exports.computePrepForecastsNow = exports.computePrepForecasts = exports.generateUpcomingSchedules = exports.dailyDigest = exports.onScheduleWrite = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const expoPush_1 = require("./expoPush");
// Initialize admin SDK once
try {
    admin.initializeApp();
}
catch { }
const db = admin.firestore();
function allTasksComplete(tasks) {
    if (!tasks || !Array.isArray(tasks) || tasks.length === 0)
        return false;
    return tasks.every(t => t.status === 'Complete');
}
async function getAllPushTokens() {
    const snap = await db.collection('pushTokens').get();
    const res = [];
    snap.forEach((d) => {
        const data = d.data();
        if (data?.token && typeof data?.userId === 'number') {
            res.push({ userId: data.userId, role: data.role || 'Employee', token: data.token });
        }
    });
    return res;
}
exports.onScheduleWrite = functions.firestore
    .document('schedules/{docId}')
    .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    if (!after)
        return;
    const beforeComplete = before ? allTasksComplete(before.tasks) : false;
    const afterComplete = allTasksComplete(after.tasks);
    // Already completed previously or nothing changed to completed
    if (!afterComplete || beforeComplete)
        return;
    // Prevent duplicate notifications by checking marker
    const notifiedAt = after.notifications?.completedPushedAt;
    if (notifiedAt)
        return;
    // Mark as notified to avoid duplicates
    try {
        await change.after.ref.set({ notifications: { ...(after.notifications || {}), completedPushedAt: new Date().toISOString() } }, { merge: true });
    }
    catch (e) {
        console.error('Failed to set completedPushedAt', e);
    }
    // Build recipients: primary prep person + managers/admins
    const all = await getAllPushTokens();
    const tokens = new Set();
    all.forEach(x => {
        if (x.userId === after.primaryPrepPerson || x.role === 'Manager' || x.role === 'IT_Admin') {
            tokens.add(x.token);
        }
    });
    const title = 'Prep Schedule Completed';
    const body = `${after.date} is finished`;
    const msgs = Array.from(tokens).map(to => ({ to, title, body }));
    if (msgs.length)
        await (0, expoPush_1.sendExpoPush)(msgs);
});
exports.dailyDigest = functions.pubsub
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
    snap.forEach((ds) => {
        const s = ds.data();
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
    const tokens = new Set();
    all.forEach(x => {
        if (x.role === 'Manager' || x.role === 'IT_Admin')
            tokens.add(x.token);
    });
    const msgs = Array.from(tokens).map(to => ({ to, title, body }));
    if (msgs.length)
        await (0, expoPush_1.sendExpoPush)(msgs);
    return null;
});
function toYyyyMmDd(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}
function scheduleIdFromDateStr(day) {
    return Number(day.replace(/-/g, ''));
}
exports.generateUpcomingSchedules = functions.pubsub
    .schedule('0 3 * * *')
    .timeZone('America/Los_Angeles')
    .onRun(async () => {
    // Load all active recurring rules
    const recurringSnap = await db.collection('recurringSchedules').where('active', '==', true).get();
    if (recurringSnap.empty)
        return null;
    const today = new Date();
    const baseDay = toYyyyMmDd(today);
    for (const doc of recurringSnap.docs) {
        const rule = doc.data();
        const templateId = rule.templateId;
        const daysOfWeek = Array.isArray(rule.daysOfWeek) ? rule.daysOfWeek : [];
        if (!templateId || daysOfWeek.length === 0)
            continue;
        const assign = rule.assign || {};
        const primaryPrepPerson = assign.primaryPrepPerson;
        const additionalWorkers = Array.isArray(assign.additionalWorkers) ? assign.additionalWorkers : [];
        if (typeof primaryPrepPerson !== 'number')
            continue;
        const startDate = rule.startDate || baseDay;
        const endDate = rule.endDate || null;
        const tz = rule.timezone || 'America/Los_Angeles';
        void tz; // placeholder in case of future timezone-specific logic
        const ahead = Math.min(Number(rule.generateDaysAhead || 7), 30);
        // Load template
        const tplSnap = await db.collection('scheduleTemplates').doc(templateId).get();
        if (!tplSnap.exists)
            continue;
        const tpl = tplSnap.data();
        const tplTasks = Array.isArray(tpl.tasks) ? tpl.tasks : [];
        // Iterate days
        for (let i = 0; i <= ahead; i++) {
            const d = new Date();
            d.setDate(today.getDate() + i);
            const dayStr = toYyyyMmDd(d);
            if (dayStr < startDate)
                continue;
            if (endDate && dayStr > endDate)
                continue;
            const dow = d.getDay(); // 0..6
            if (!daysOfWeek.includes(dow))
                continue;
            // Skip if schedule already exists for this date
            const existing = await db.collection('schedules').where('date', '==', dayStr).limit(1).get();
            if (!existing.empty)
                continue;
            // Build tasks
            const tasks = tplTasks.map((t, idx) => ({
                id: Date.now() + idx,
                name: String(t.name || ''),
                qty: String(t.qty || ''),
                status: 'Incomplete',
                notes: String(t.notes || ''),
                priority: (t.priority || 'medium'),
            }));
            const newSchedule = {
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
var forecast_1 = require("./forecast");
Object.defineProperty(exports, "computePrepForecasts", { enumerable: true, get: function () { return forecast_1.computePrepForecasts; } });
Object.defineProperty(exports, "computePrepForecastsNow", { enumerable: true, get: function () { return forecast_1.computePrepForecastsNow; } });
