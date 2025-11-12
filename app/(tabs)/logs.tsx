import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUser } from '@/context/UserContext';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';

// Types (align with rest of app)
type Priority = 'high' | 'medium' | 'low';

interface PrepTask {
  id: number;
  name: string;
  qty: string;
  status: 'Incomplete' | 'Complete';
  notes: string;
  priority: Priority;
  completedBy?: number;
  completedAt?: string;
}

interface PrepSchedule {
  id: number;
  date: string; // ISO yyyy-mm-dd
  primaryPrepPerson: number;
  additionalWorkers: number[];
  tasks: PrepTask[];
  createdBy: number;
  createdAt: string;
}

// Helper: date presets
const getDateNDaysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export default function LogsScreen() {
  const { currentUser, allUsers } = useUser();
  const [schedules, setSchedules] = useState<PrepSchedule[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'complete' | 'incomplete'>('all');
  const [userFilter, setUserFilter] = useState<number | 'all'>('all');
  const [range, setRange] = useState<'today' | '7' | '30'>('7');

  // subscribe to schedules
  useEffect(() => {
    const q = query(collection(db, 'schedules'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const next: PrepSchedule[] = [];
      snap.forEach(ds => {
        const d = ds.data() as any;
        if (typeof d?.id !== 'number') return;
        next.push({
          id: d.id,
          date: d.date,
          primaryPrepPerson: d.primaryPrepPerson,
          additionalWorkers: d.additionalWorkers || [],
          tasks: d.tasks || [],
          createdBy: d.createdBy,
          createdAt: d.createdAt || new Date().toISOString(),
        });
      });
      setSchedules(next);
    });
    return () => unsub();
  }, []);

  const dateBounds = useMemo(() => {
    const today = getDateNDaysAgo(0);
    if (range === 'today') return { start: today, end: today };
    if (range === '7') return { start: getDateNDaysAgo(6), end: today };
    return { start: getDateNDaysAgo(29), end: today };
  }, [range]);

  const filtered = useMemo(() => {
    const start = dateBounds.start;
    const end = dateBounds.end;

    const inRange = (dateStr: string) => dateStr >= start && dateStr <= end;
    const matchesUser = (s: PrepSchedule) => {
      if (userFilter === 'all') return true;
      return s.primaryPrepPerson === userFilter || s.additionalWorkers.includes(userFilter);
    };

    return schedules
      .filter(s => inRange(s.date) && matchesUser(s))
      .map(s => ({
        ...s,
        tasks: s.tasks.filter(t => {
          if (statusFilter === 'all') return true;
          if (statusFilter === 'complete') return t.status === 'Complete';
          return t.status === 'Incomplete';
        }),
      }))
      .filter(s => s.tasks.length > 0);
  }, [schedules, dateBounds, userFilter, statusFilter]);

  const stats = useMemo(() => {
    const total = filtered.reduce((acc, s) => acc + s.tasks.length, 0);
    const done = filtered.reduce((acc, s) => acc + s.tasks.filter(t => t.status === 'Complete').length, 0);
    const pending = total - done;
    const rate = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, pending, rate };
  }, [filtered]);

  // Basic analytics: Top incomplete task names with counts
  const topIncomplete = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach(s => {
      s.tasks.forEach(t => {
        if (t.status === 'Incomplete') {
          const key = t.name?.trim() || 'Unnamed Task';
          counts[key] = (counts[key] || 0) + 1;
        }
      });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [filtered]);

  // Block access for non-managers/non-admins
  if (!currentUser || (currentUser.role !== 'Manager' && currentUser.role !== 'IT_Admin')) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerText}>🔒 Access Denied</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🚫</Text>
          <Text style={{ fontSize: 18, color: '#e74c3c', fontWeight: '700', textAlign: 'center' }}>
            Logs are only accessible to Managers and IT Admins.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const getUserName = (id?: number) => {
    if (!id && id !== 0) return 'Unknown';
    const u = allUsers.find(x => x.id === id);
    return u ? u.name : `User ${id}`;
  };

  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case 'high': return '#e74c3c';
      case 'medium': return '#f39c12';
      case 'low': return '#3498db';
      default: return '#95a5a6';
    }
  };

  // --- Export helpers ---
  const buildCsv = () => {
    // headers
    const cols = [
      'Date', 'Task', 'Quantity', 'Status', 'Notes', 'Priority', 'Completed By', 'Completed At', 'Primary', 'Additional Workers'
    ];
    const rows: string[] = [cols.join(',')];
    const esc = (s: any) => {
      const v = (s ?? '').toString().replace(/"/g, '""');
      return `"${v}"`;
    };
    filtered.forEach(s => {
      const primary = getUserName(s.primaryPrepPerson);
      const additional = s.additionalWorkers.map(getUserName).join('; ');
      s.tasks.forEach(t => {
        const completedBy = t.completedBy ? getUserName(t.completedBy) : '';
        const completedAt = t.completedAt ? new Date(t.completedAt).toLocaleString('en-US') : '';
        rows.push([
          esc(s.date),
          esc(t.name),
          esc(t.qty),
          esc(t.status),
          esc(t.notes),
          esc(t.priority),
          esc(completedBy),
          esc(completedAt),
          esc(primary),
          esc(additional),
        ].join(','));
      });
    });
    return rows.join('\n');
  };

  const exportCsv = async () => {
    try {
      if (filtered.length === 0) {
        Alert.alert('No data', 'There are no logs to export for the selected filters.');
        return;
      }
      const csv = buildCsv();
      const ts = new Date();
      const tag = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}_${String(ts.getHours()).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}`;
      const cacheDir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory || '';
      const fileUri = `${cacheDir}prep_logs_${tag}.csv`;
      const encodingUtf8 = ((FileSystem as any).EncodingType && (FileSystem as any).EncodingType.UTF8) || 'utf8';
      await (FileSystem as any).writeAsStringAsync(fileUri, csv, { encoding: encodingUtf8 });

      if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) {
        Alert.alert('Export ready', 'CSV generated. On web, please check console for data or implement download.');
        return;
      }
      await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Share Prep Logs CSV' });
    } catch (e: any) {
      Alert.alert('Export failed', e?.message || 'Unknown error while exporting CSV');
    }
  };

  const buildPdfHtml = () => {
    const rows = filtered.map(s => {
      const tasks = s.tasks.map(t => `
        <tr>
          <td>${s.date}</td>
          <td>${(t.name || '').replace(/</g, '&lt;')}</td>
          <td>${(t.qty || '').replace(/</g, '&lt;')}</td>
          <td>${t.status}</td>
          <td>${(t.notes || '').replace(/</g, '&lt;')}</td>
          <td>${t.priority}</td>
          <td>${getUserName(t.completedBy)}</td>
          <td>${t.completedAt ? new Date(t.completedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}</td>
          <td>${getUserName(s.primaryPrepPerson)}</td>
          <td>${s.additionalWorkers.map(getUserName).join(', ')}</td>
        </tr>
      `).join('');
      return tasks;
    }).join('');

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: Arial, sans-serif; padding: 16px; }
            h1 { margin-bottom: 4px; }
            .muted { color: #666; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border: 1px solid #ddd; padding: 6px; font-size: 12px; }
            th { background: #f3f3f3; text-align: left; }
            .stats { display: flex; gap: 12px; margin-top: 8px; }
            .card { border: 1px solid #eee; padding: 8px 12px; border-radius: 8px; }
          </style>
        </head>
        <body>
          <h1>Prep Logs</h1>
          <div class="muted">Range: ${dateBounds.start} - ${dateBounds.end} | Status: ${statusFilter} | User: ${userFilter === 'all' ? 'All Users' : getUserName(userFilter as number)}</div>
          <div class="stats">
            <div class="card">Complete Rate: <b>${stats.rate}%</b></div>
            <div class="card">Done: <b>${stats.done}</b></div>
            <div class="card">Pending: <b>${stats.pending}</b></div>
            <div class="card">Total: <b>${stats.total}</b></div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Task</th><th>Qty</th><th>Status</th><th>Notes</th><th>Priority</th><th>Completed By</th><th>Completed At</th><th>Primary</th><th>Additional</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </body>
      </html>
    `;
  };

  const exportPdf = async () => {
    try {
      if (filtered.length === 0) {
        Alert.alert('No data', 'There are no logs to export for the selected filters.');
        return;
      }
      const html = buildPdfHtml();
      const { uri } = await Print.printToFileAsync({ html });
      if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) {
        Alert.alert('Export ready', 'PDF generated. On web, download/presenting is not handled automatically.');
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share Prep Logs PDF' });
    } catch (e: any) {
      Alert.alert('Export failed', e?.message || 'Unknown error while exporting PDF');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>📘 Prep Logs</Text>
        <Text style={styles.subHeaderText}>
          {currentUser?.role === 'Manager' ? 'Manager' : currentUser?.role === 'IT_Admin' ? 'Admin' : 'Employee'} View
        </Text>
      </View>

      {/* Filters */}
      <View style={styles.filters}>
        <View style={styles.segment}>
          {(['today','7','30'] as const).map(k => (
            <TouchableOpacity key={k} style={[styles.segmentBtn, range === k && styles.segmentBtnActive]} onPress={() => setRange(k)}>
              <Text style={[styles.segmentText, range === k && styles.segmentTextActive]}>
                {k === 'today' ? 'Today' : k === '7' ? 'Last 7' : 'Last 30'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.segment}>
          {(['all','incomplete','complete'] as const).map(k => (
            <TouchableOpacity key={k} style={[styles.segmentBtn, statusFilter === k && styles.segmentBtnActive]} onPress={() => setStatusFilter(k)}>
              <Text style={[styles.segmentText, statusFilter === k && styles.segmentTextActive]}>
                {k === 'all' ? 'All' : k === 'incomplete' ? 'Pending' : 'Done'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <TouchableOpacity 
            style={[styles.chip, userFilter === 'all' && styles.chipActive]}
            onPress={() => setUserFilter('all')}
          >
            <Text style={[styles.chipText, userFilter === 'all' && styles.chipTextActive]}>All Users</Text>
          </TouchableOpacity>
          {allUsers.map(u => (
            <TouchableOpacity 
              key={u.id} 
              style={[styles.chip, userFilter === u.id && styles.chipActive]}
              onPress={() => setUserFilter(u.id)}
            >
              <Text style={[styles.chipText, userFilter === u.id && styles.chipTextActive]}>{u.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Stats */}
      <View style={styles.statsCard}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.rate}%</Text>
          <Text style={styles.statLabel}>Complete</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.done}</Text>
          <Text style={styles.statLabel}>✅ Done</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.pending}</Text>
          <Text style={styles.statLabel}>⏳ Pending</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.total}</Text>
          <Text style={styles.statLabel}>📋 Total</Text>
        </View>
      </View>

      {/* Analytics */}
      <View style={styles.analyticsCard}>
        <Text style={styles.analyticsTitle}>Top Incomplete Tasks</Text>
        {topIncomplete.length === 0 ? (
          <Text style={styles.analyticsEmpty}>No incomplete tasks in this range.</Text>
        ) : (
          topIncomplete.map(([name, count]) => (
            <View key={name} style={styles.analyticsRow}>
              <Text style={styles.analyticsName}>{name}</Text>
              <Text style={styles.analyticsCount}>{count}</Text>
            </View>
          ))
        )}
      </View>

      {/* Export Toolbar */}
      <View style={styles.exportBar}>
        <TouchableOpacity style={[styles.exportBtn, filtered.length === 0 && styles.exportBtnDisabled]} onPress={exportCsv} disabled={filtered.length === 0}>
          <Text style={styles.exportBtnText}>Export CSV</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.exportBtn, filtered.length === 0 && styles.exportBtnDisabled]} onPress={exportPdf} disabled={filtered.length === 0}>
          <Text style={styles.exportBtnText}>Export PDF</Text>
        </TouchableOpacity>
      </View>

      {/* Results */}
      <ScrollView style={styles.results} showsVerticalScrollIndicator={false}>
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🗓️</Text>
            <Text style={styles.emptyText}>No logs for selected filters.</Text>
          </View>
        ) : (
          filtered.map(s => (
            <View key={s.id} style={styles.scheduleCard}>
              <View style={styles.scheduleHeader}>
                <Text style={styles.scheduleDate}>{s.date}</Text>
                <Text style={styles.scheduleTeam}>
                  {getUserName(s.primaryPrepPerson)}{s.additionalWorkers.length ? ` + ${s.additionalWorkers.map(getUserName).join(', ')}` : ''}
                </Text>
              </View>

              {s.tasks.map(t => (
                <View key={t.id} style={[styles.taskRow, t.status === 'Complete' ? styles.taskRowDone : styles.taskRowPending]}>
                  <View style={[styles.priorityDot, { backgroundColor: getPriorityColor(t.priority) }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.taskName, t.status === 'Complete' && styles.taskNameDone]}>{t.name} • {t.qty}</Text>
                    {t.notes ? (
                      <Text style={styles.taskNotes}>{t.notes}</Text>
                    ) : null}
                    {t.status === 'Complete' && (
                      <Text style={styles.completedMeta}>
                        Completed by {getUserName(t.completedBy)}{t.completedAt ? ` at ${new Date(t.completedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.statusBadge, t.status === 'Complete' ? styles.statusDone : styles.statusPending]}>
                    {t.status === 'Complete' ? 'Done' : 'Pending'}
                  </Text>
                </View>
              ))}
            </View>
          ))
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  header: {
    backgroundColor: '#2c3e50',
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  headerText: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 4 },
  subHeaderText: { fontSize: 14, color: '#ecf0f1', fontWeight: '500' },

  filters: { padding: 16, gap: 12 },
  segment: { flexDirection: 'row', gap: 8 },
  segmentBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#ffffff', borderWidth: 2, borderColor: '#e0e0e0', alignItems: 'center' },
  segmentBtnActive: { backgroundColor: '#3498db', borderColor: '#3498db' },
  segmentText: { fontSize: 13, fontWeight: '700', color: '#7f8c8d' },
  segmentTextActive: { color: '#fff' },

  chip: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 2, borderColor: '#e0e0e0' },
  chipActive: { backgroundColor: '#2ecc71', borderColor: '#2ecc71' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#7f8c8d' },
  chipTextActive: { color: '#fff' },

  statsCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  analyticsCard: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  analyticsTitle: { fontSize: 14, fontWeight: '800', color: '#2c3e50', marginBottom: 8 },
  analyticsEmpty: { color: '#7f8c8d', fontSize: 12 },
  analyticsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  analyticsName: { fontSize: 13, color: '#2c3e50', fontWeight: '600' },
  analyticsCount: { fontSize: 13, color: '#2c3e50', fontWeight: '800' },

  exportBar: { marginHorizontal: 16, marginTop: 10, flexDirection: 'row', gap: 10 },
  exportBtn: { flex: 1, backgroundColor: '#34495e', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  exportBtnDisabled: { backgroundColor: '#95a5a6' },
  exportBtnText: { color: '#fff', fontWeight: '800' },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 22, fontWeight: '800', color: '#2c3e50' },
  statLabel: { fontSize: 12, color: '#7f8c8d', fontWeight: '600' },
  statDivider: { width: 1, height: 36, backgroundColor: '#ecf0f1' },

  results: { flex: 1, paddingHorizontal: 16 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 56, marginBottom: 12 },
  emptyText: { color: '#95a5a6', fontWeight: '600' },

  scheduleCard: {
    backgroundColor: '#ffffff', borderRadius: 12, padding: 12, marginTop: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  scheduleHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  scheduleDate: { fontSize: 14, fontWeight: '800', color: '#2c3e50' },
  scheduleTeam: { fontSize: 12, color: '#7f8c8d', fontWeight: '600', maxWidth: '65%' },

  taskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  taskRowDone: { backgroundColor: '#f0fbf7' },
  taskRowPending: { backgroundColor: '#fffaf0' },
  priorityDot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  taskName: { fontSize: 14, color: '#2c3e50', fontWeight: '700' },
  taskNameDone: { color: '#7f8c8d', textDecorationLine: 'line-through' },
  taskNotes: { fontSize: 12, color: '#7f8c8d', marginTop: 4 },
  completedMeta: { fontSize: 11, color: '#2c3e50', marginTop: 4 },
  statusBadge: { marginLeft: 8, alignSelf: 'center', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, fontSize: 11, fontWeight: '800', overflow: 'hidden', color: '#fff' },
  statusDone: { backgroundColor: '#2ecc71' },
  statusPending: { backgroundColor: '#e67e22' },
});
