import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUser } from '@/context/UserContext';
import { useLocale } from '@/context/LocaleContext';
import { Collapsible } from '@/components/ui/collapsible';

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
}

const getDateNDaysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export default function AnalyticsScreen() {
  const { currentUser, allUsers } = useUser();
  const { t } = useLocale();
  const [schedules, setSchedules] = useState<PrepSchedule[]>([]);
  const [range, setRange] = useState<'7' | '30' | 'all'>('30');

  useEffect(() => {
    const q = query(collection(db, 'schedules'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const next: PrepSchedule[] = [];
      snap.forEach(docSnap => {
        const data = docSnap.data() as any;
        if (typeof data?.id !== 'number') return;
        next.push({
          id: data.id,
          date: data.date,
          primaryPrepPerson: data.primaryPrepPerson,
          additionalWorkers: data.additionalWorkers || [],
          tasks: data.tasks || [],
          createdBy: data.createdBy,
          createdAt: data.createdAt || new Date().toISOString(),
        });
      });
      setSchedules(next);
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    if (range === 'all') return schedules;
    const cutoff = getDateNDaysAgo(range === '7' ? 7 : 30);
    return schedules.filter(s => s.date >= cutoff);
  }, [schedules, range]);

  const getUserName = useMemo(() => {
    return (userId: number) => {
      const user = allUsers.find(u => u.id === userId);
      return user ? user.name : 'Unknown User';
    };
  }, [allUsers]);

  const avgCompletionTime = useMemo(() => {
    const taskTimes: { name: string; times: number[] }[] = [];
    filtered.forEach(s => {
      s.tasks.forEach(t => {
        if (t.status === 'Complete' && t.duration && t.duration > 0) {
          const existing = taskTimes.find(tt => tt.name === t.name);
          if (existing) existing.times.push(t.duration); else taskTimes.push({ name: t.name, times: [t.duration] });
        }
      });
    });
    return taskTimes
      .map(tt => ({ name: tt.name, avgTime: tt.times.reduce((a, b) => a + b, 0) / tt.times.length, count: tt.times.length }))
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, 10);
  }, [filtered]);

  const employeePerformance = useMemo(() => {
    const stats: Record<number, { completed: number; incomplete: number; totalTime: number }> = {};
    filtered.forEach(s => {
      s.tasks.forEach(t => {
        if (t.completedBy) {
          if (!stats[t.completedBy]) stats[t.completedBy] = { completed: 0, incomplete: 0, totalTime: 0 };
          if (t.status === 'Complete') { stats[t.completedBy].completed++; if (t.duration) stats[t.completedBy].totalTime += t.duration; }
          else { stats[t.completedBy].incomplete++; }
        }
      });
    });
    return Object.entries(stats)
      .map(([userId, stat]) => ({ userId: Number(userId), name: getUserName(Number(userId)), completed: stat.completed, incomplete: stat.incomplete, total: stat.completed + stat.incomplete, completionRate: stat.completed / (stat.completed + stat.incomplete), avgTime: stat.totalTime > 0 ? stat.totalTime / stat.completed : 0 }))
      .sort((a, b) => b.completed - a.completed);
  }, [filtered, getUserName]);

  const incompleteTaskTrends = useMemo(() => {
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
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [filtered]);

  const summary = useMemo(() => {
    let totalTasks = 0; let completedTasks = 0; let totalTime = 0;
    filtered.forEach(s => {
      s.tasks.forEach(t => { totalTasks++; if (t.status === 'Complete') { completedTasks++; if (t.duration) totalTime += t.duration; } });
    });
    return { totalSchedules: filtered.length, totalTasks, completedTasks, incompleteTasks: totalTasks - completedTasks, completionRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0, avgTimePerTask: completedTasks > 0 ? totalTime / completedTasks : 0 };
  }, [filtered]);

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  if (!currentUser || (currentUser.role !== 'Manager' && currentUser.role !== 'IT_Admin')) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <Image source={{ uri: 'https://i.ibb.co/7tmLxCNZ/Purple-Minimalist-People-Profile-Logo-1.png' }} style={styles.logo} />
        </View>
        <View style={styles.accessDenied}>
          <Text style={styles.accessDeniedTitle}>{t('accessDeniedTitle')}</Text>
          <Text style={styles.accessDeniedText}>
            {t('accessDeniedText')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Image source={{ uri: 'https://i.ibb.co/7tmLxCNZ/Purple-Minimalist-People-Profile-Logo-1.png' }} style={styles.logo} />
      </View>

      <View style={styles.content}>
        <Text style={styles.pageTitle}>{t('analyticsReports')}</Text>
        <Text style={styles.pageSubtitle}>{t('performanceInsights')}</Text>

        <View style={styles.rangeSelector}>
          {(['7', '30', 'all'] as const).map(r => (
            <TouchableOpacity
              key={r}
              style={[
                styles.rangeButton,
                range === r && styles.rangeButtonActive,
              ]}
              onPress={() => setRange(r)}
            >
              <Text style={[styles.rangeButtonText, range === r && styles.rangeButtonTextActive]}>
                {r === '7' ? t('range7') : r === '30' ? t('range30') : t('all')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>{t('totalSchedules')}</Text>
              <Text style={styles.summaryValue}>{summary.totalSchedules}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>{t('totalTasks')}</Text>
              <Text style={styles.summaryValue}>{summary.totalTasks}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>{t('completionRate')}</Text>
              <Text style={[styles.summaryValue, { color: summary.completionRate >= 80 ? '#10b981' : summary.completionRate >= 50 ? '#f59e0b' : '#ef4444' }]}>
                {summary.completionRate.toFixed(0)}%
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>{t('avgTimePerTask')}</Text>
              <Text style={styles.summaryValue}>{formatTime(summary.avgTimePerTask)}</Text>
            </View>
          </View>

          <Collapsible title={t('employeePerformance')}>
            <>
              {employeePerformance.length === 0 ? (
                <Text style={styles.emptyText}>{t('noPerformanceData')}</Text>
              ) : (
                employeePerformance.map((emp, idx) => (
                  <View key={emp.userId} style={[styles.employeeRow, idx !== employeePerformance.length - 1 && styles.borderBottom]}>
                    <View style={styles.employeeInfo}>
                      <Text style={styles.employeeName}>{emp.name}</Text>
                      <Text style={styles.employeeStats}>
                        {emp.completed} {t('completed')} • {emp.incomplete} {t('incomplete')}
                      </Text>
                    </View>
                    <View style={styles.employeeMetrics}>
                      <Text style={[styles.metricValue, { color: emp.completionRate >= 0.8 ? '#10b981' : emp.completionRate >= 0.5 ? '#f59e0b' : '#ef4444' }]}>
                        {(emp.completionRate * 100).toFixed(0)}%
                      </Text>
                      {emp.avgTime > 0 && (
                        <Text style={styles.metricLabel}>{formatTime(emp.avgTime)} / {t('task')}</Text>
                      )}
                    </View>
                  </View>
                ))
              )}
            </>
          </Collapsible>

          <Collapsible title={t('avgTaskCompletionTimes')}>
            <>
              {avgCompletionTime.length === 0 ? (
                <Text style={styles.emptyText}>{t('noTimingData')}</Text>
              ) : (
                avgCompletionTime.map((task, idx) => (
                  <View key={idx} style={[styles.taskRow, idx !== avgCompletionTime.length - 1 && styles.borderBottom]}>
                    <View style={styles.taskInfo}>
                      <Text style={styles.taskName}>{task.name}</Text>
                      <Text style={styles.taskCount}>{task.count} {t('completions')}</Text>
                    </View>
                    <Text style={styles.taskTime}>{formatTime(task.avgTime)}</Text>
                  </View>
                ))
              )}
            </>
          </Collapsible>

          <Collapsible title={t('incompleteTaskTrends')}>
            <>
              {incompleteTaskTrends.length === 0 ? (
                <Text style={styles.emptyText}>{t('noIncompleteData')}</Text>
              ) : (
                incompleteTaskTrends.map((task, idx) => (
                  <View key={idx} style={[styles.trendRow, idx !== incompleteTaskTrends.length - 1 && styles.borderBottom]}>
                    <Text style={styles.trendName}>{task.name}</Text>
                    <View style={styles.trendBadge}>
                      <Text style={styles.trendCount}>{task.count}</Text>
                    </View>
                  </View>
                ))
              )}
            </>
          </Collapsible>

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
  rangeSelector: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  rangeButton: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center', backgroundColor: '#f3f4f6' },
  rangeButtonActive: { backgroundColor: '#2563eb' },
  rangeButtonText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  rangeButtonTextActive: { color: '#ffffff' },
  scrollContent: { flex: 1 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  summaryCard: { flex: 1, minWidth: '47%', padding: 16, borderRadius: 12, alignItems: 'center', backgroundColor: '#f9fafb' },
  summaryLabel: { fontSize: 12, fontWeight: '500', marginBottom: 8, color: '#6b7280' },
  summaryValue: { fontSize: 24, fontWeight: '700', color: '#111827' },
  emptyText: { textAlign: 'center', fontSize: 14, fontStyle: 'italic', color: '#6b7280' },
  employeeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  employeeInfo: { flex: 1 },
  employeeName: { fontSize: 16, fontWeight: '600', marginBottom: 4, color: '#111827' },
  employeeStats: { fontSize: 12, color: '#6b7280' },
  employeeMetrics: { alignItems: 'flex-end' },
  metricValue: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  metricLabel: { fontSize: 11, color: '#6b7280' },
  taskRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  taskInfo: { flex: 1 },
  taskName: { fontSize: 14, fontWeight: '600', marginBottom: 4, color: '#111827' },
  taskCount: { fontSize: 11, color: '#6b7280' },
  taskTime: { fontSize: 16, fontWeight: '600', color: '#111827' },
  trendRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  trendName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#111827' },
  trendBadge: { backgroundColor: '#ef4444', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  trendCount: { color: '#fff', fontSize: 14, fontWeight: '700' },
  borderBottom: { borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  accessDenied: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  accessDeniedTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  accessDeniedText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
});
