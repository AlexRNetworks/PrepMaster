import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  Modal, 
  TouchableOpacity, 
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useLocale } from '@/context/LocaleContext';

type UserRole = 'IT_Admin' | 'Manager' | 'Employee';

interface User {
  id: number;
  name: string;
  pin: string;
  role: UserRole;
  permissions: string[];
  active: boolean;
  createdAt: string;
}

interface PrepLog {
  scheduleId: number;
  scheduleDate: string;
  taskId: number;
  taskName: string;
  qty: string;
  action: 'prepared' | 'reverted';
  userId: number;
  userName: string;
  createdAt: any;
  startedAt?: string;
  finishedAt?: string;
  durationSeconds?: number;
}

interface ProfileStats {
  totalTasksCompleted: number;
  totalTasksReverted: number;
  completionRate: number;
  weeklyTasks: PrepLog[];
  averageTimes: { [taskName: string]: number };
  topPreps: { name: string; count: number }[];
}

interface ProfileModalProps {
  visible: boolean;
  onClose: () => void;
  user: User;
  onLogout: () => void;
}

export default function ProfileModal({ visible, onClose, user, onLogout }: ProfileModalProps) {
  const { t } = useLocale();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ProfileStats>({
    totalTasksCompleted: 0,
    totalTasksReverted: 0,
    completionRate: 0,
    weeklyTasks: [],
    averageTimes: {},
    topPreps: [],
  });
  const [activeTab, setActiveTab] = useState<'overview' | 'weekly' | 'performance'>('overview');

  useEffect(() => {
    if (visible && user) {
      loadUserStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, user]);

  const loadUserStats = async () => {
    setLoading(true);
    try {
      const logsRef = collection(db, 'prepLogs');
      
      // Get all logs for this user (single query to avoid composite index)
      const allLogsQuery = query(
        logsRef,
        where('userId', '==', user.id)
      );
      const allLogsSnap = await getDocs(allLogsQuery);
      
      let totalCompleted = 0;
      let totalReverted = 0;
      const prepCounts: { [name: string]: number } = {};
      const durationsByTask: { [name: string]: number[] } = {};
      const allLogs: PrepLog[] = [];
      
      allLogsSnap.forEach((doc) => {
        const log = doc.data() as PrepLog;
        allLogs.push(log);
        
        if (log.action === 'prepared') {
          totalCompleted++;
          prepCounts[log.taskName] = (prepCounts[log.taskName] || 0) + 1;
          if (typeof log.durationSeconds === 'number' && log.durationSeconds > 0) {
            if (!durationsByTask[log.taskName]) durationsByTask[log.taskName] = [];
            durationsByTask[log.taskName].push(log.durationSeconds);
          }
        } else if (log.action === 'reverted') {
          totalReverted++;
        }
      });

      // Filter logs from the last 7 days in memory
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekAgoStr = weekAgo.toISOString().split('T')[0];
      
      const weeklyTasks = allLogs
        .filter(log => log.scheduleDate >= weekAgoStr)
        .sort((a, b) => b.scheduleDate.localeCompare(a.scheduleDate));

      // Calculate top preps
      const topPreps = Object.entries(prepCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Calculate completion rate (completed vs total actions)
      const totalActions = totalCompleted + totalReverted;
      const completionRate = totalActions > 0 ? Math.round((totalCompleted / totalActions) * 100) : 100;

      // Compute average times (seconds) by task name
      const averageTimes: { [taskName: string]: number } = {};
      Object.entries(durationsByTask).forEach(([name, arr]) => {
        const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
        averageTimes[name] = Math.round(avg);
      });

      setStats({
        totalTasksCompleted: totalCompleted,
        totalTasksReverted: totalReverted,
        completionRate,
        weeklyTasks,
        averageTimes,
        topPreps,
      });
    } catch (error) {
      console.error('Error loading user stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRoleDisplay = (role: UserRole) => {
    switch (role) {
      case 'IT_Admin': return t('itAdmin');
      case 'Manager': return t('manager');
      case 'Employee': return t('employee');
      default: return t('employee');
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return dateString;
    }
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const renderOverviewTab = () => (
    <ScrollView 
      style={styles.tabContent}
      contentContainerStyle={styles.tabContentContainer}
      keyboardShouldPersistTaps="handled"
    >
      {/* User Info Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <IconSymbol name="person.circle.fill" size={24} color="#2563eb" />
          <Text style={styles.cardTitle}>{t('userInfo')}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('name')}:</Text>
          <Text style={styles.infoValue}>{user.name}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('role')}:</Text>
          <Text style={styles.infoValue}>{getRoleDisplay(user.role)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>PIN:</Text>
          <Text style={styles.infoValue}>{user.pin}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('status')}:</Text>
          <View style={[styles.statusBadge, user.active ? styles.statusActive : styles.statusInactive]}>
            <Text style={styles.statusText}>{user.active ? t('active') : t('inactive')}</Text>
          </View>
        </View>
      </View>

      {/* Performance Stats Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <IconSymbol name="chart.bar.fill" size={24} color="#10b981" />
          <Text style={styles.cardTitle}>{t('performance')}</Text>
        </View>
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={[styles.statNumber, { color: '#10b981' }]}>{stats.totalTasksCompleted}</Text>
            <Text style={styles.statLabel}>{t('tasksCompleted')}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNumber, { color: '#f59e0b' }]}>{stats.totalTasksReverted}</Text>
            <Text style={styles.statLabel}>{t('tasksReverted')}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNumber, { color: '#2563eb' }]}>{stats.completionRate}%</Text>
            <Text style={styles.statLabel}>{t('completionRate')}</Text>
          </View>
        </View>
      </View>

      {/* Top Preps Card */}
      {stats.topPreps.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <IconSymbol name="star.fill" size={24} color="#f59e0b" />
            <Text style={styles.cardTitle}>{t('topPreps')}</Text>
          </View>
          {stats.topPreps.map((prep, index) => (
            <View key={index} style={styles.topPrepRow}>
              <View style={styles.topPrepRank}>
                <Text style={styles.topPrepRankText}>{index + 1}</Text>
              </View>
              <Text style={styles.topPrepName}>{prep.name}</Text>
              <Text style={styles.topPrepCount}>{prep.count}x</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );

  const renderWeeklyTab = () => (
    <ScrollView 
      style={styles.tabContent}
      contentContainerStyle={styles.tabContentContainer}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <IconSymbol name="calendar" size={24} color="#2563eb" />
          <Text style={styles.cardTitle}>{t('last7Days')}</Text>
        </View>
        <Text style={styles.weeklySubtitle}>
          {stats.weeklyTasks.filter(t => t.action === 'prepared').length} {t('tasksCompleted')}
        </Text>
        {stats.weeklyTasks.length === 0 ? (
          <Text style={styles.emptyText}>{t('noActivityThisWeek')}</Text>
        ) : (
          stats.weeklyTasks.map((task, index) => (
            <View key={index} style={styles.weeklyTaskRow}>
              <View style={[
                styles.actionIndicator,
                task.action === 'prepared' ? styles.actionPrepared : styles.actionReverted
              ]} />
              <View style={styles.weeklyTaskInfo}>
                <Text style={styles.weeklyTaskName}>{task.taskName}</Text>
                <Text style={styles.weeklyTaskDate}>{formatDate(task.scheduleDate)}</Text>
              </View>
              <Text style={styles.weeklyTaskQty}>{task.qty}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );

  const renderPerformanceTab = () => (
    <ScrollView 
      style={styles.tabContent}
      contentContainerStyle={styles.tabContentContainer}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <IconSymbol name="speedometer" size={24} color="#8b5cf6" />
          <Text style={styles.cardTitle}>{t('detailedStats')}</Text>
        </View>
        
        {/* Completion Rate Progress Bar */}
        <View style={styles.progressSection}>
          <Text style={styles.progressLabel}>{t('completionRate')}</Text>
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBarFill, { width: `${stats.completionRate}%` }]} />
          </View>
          <Text style={styles.progressValue}>{stats.completionRate}%</Text>
        </View>

        {/* Total Actions */}
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t('totalActions')}:</Text>
          <Text style={styles.detailValue}>{stats.totalTasksCompleted + stats.totalTasksReverted}</Text>
        </View>

        {/* Success Rate */}
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t('successfulCompletions')}:</Text>
          <Text style={[styles.detailValue, { color: '#10b981' }]}>{stats.totalTasksCompleted}</Text>
        </View>

        {/* Reverted Tasks */}
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t('revertedTasks')}:</Text>
          <Text style={[styles.detailValue, { color: '#ef4444' }]}>{stats.totalTasksReverted}</Text>
        </View>

        {/* Weekly Activity */}
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t('thisWeekActivity')}:</Text>
          <Text style={styles.detailValue}>{stats.weeklyTasks.length} {t('actions')}</Text>
        </View>
      </View>

      {/* Average Times Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <IconSymbol name="clock.fill" size={24} color="#f59e0b" />
          <Text style={styles.cardTitle}>{t('averageTimes')}</Text>
        </View>
        {Object.keys(stats.averageTimes).length === 0 ? (
          <Text style={styles.emptyText}>{t('timeTrackingComingSoon')}</Text>
        ) : (
          Object.entries(stats.averageTimes)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([name, secs], idx) => (
              <View key={name + idx} style={styles.avgRow}>
                <Text style={styles.avgName}>{name}</Text>
                <Text style={styles.avgValue}>{formatDuration(secs)}</Text>
              </View>
            ))
        )}
      </View>
    </ScrollView>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <IconSymbol name="person.circle.fill" size={32} color="#2563eb" />
              <View style={styles.headerText}>
                <Text style={styles.headerTitle}>{user.name}</Text>
                <Text style={styles.headerSubtitle}>{getRoleDisplay(user.role)}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <IconSymbol name="xmark.circle.fill" size={28} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {/* Tabs + Content (flex) */}
          <View style={styles.contentContainer}>
            {/* Tabs */}
            <View style={styles.tabBar}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'overview' && styles.tabActive]}
                onPress={() => setActiveTab('overview')}
              >
                <Text style={[styles.tabText, activeTab === 'overview' && styles.tabTextActive]}>
                  {t('overview')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'weekly' && styles.tabActive]}
                onPress={() => setActiveTab('weekly')}
              >
                <Text style={[styles.tabText, activeTab === 'weekly' && styles.tabTextActive]}>
                  {t('weekly')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'performance' && styles.tabActive]}
                onPress={() => setActiveTab('performance')}
              >
                <Text style={[styles.tabText, activeTab === 'performance' && styles.tabTextActive]}>
                  {t('performance')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Content */}
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2563eb" />
                <Text style={styles.loadingText}>{t('loadingStats')}</Text>
              </View>
            ) : (
              <View style={styles.tabsBody}>
                {activeTab === 'overview' && renderOverviewTab()}
                {activeTab === 'weekly' && renderWeeklyTab()}
                {activeTab === 'performance' && renderPerformanceTab()}
              </View>
            )}
          </View>

          {/* Footer with Logout */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
              <IconSymbol name="arrow.right.square.fill" size={20} color="#ffffff" />
              <Text style={styles.logoutButtonText}>{t('logout')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    width: '100%',
    maxHeight: '90%',
    height: '85%',
    paddingTop: 20,
    alignSelf: 'stretch',
  },
  contentContainer: {
    flex: 1,
    minHeight: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerText: {
    gap: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  closeButton: {
    padding: 4,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#2563eb',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  tabTextActive: {
    color: '#2563eb',
  },
  tabContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  tabContentContainer: {
    paddingBottom: 24,
  },
  tabsBody: {
    flex: 1,
    minHeight: 0,
  },
  loadingContainer: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  card: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  infoLabel: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusActive: {
    backgroundColor: '#d1fae5',
  },
  statusInactive: {
    backgroundColor: '#fee2e2',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#6b7280',
    textAlign: 'center',
    fontWeight: '500',
  },
  topPrepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    gap: 12,
  },
  topPrepRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topPrepRankText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  topPrepName: {
    flex: 1,
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
  },
  topPrepCount: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '600',
  },
  weeklySubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
  },
  weeklyTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    gap: 12,
  },
  actionIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  actionPrepared: {
    backgroundColor: '#10b981',
  },
  actionReverted: {
    backgroundColor: '#ef4444',
  },
  weeklyTaskInfo: {
    flex: 1,
  },
  weeklyTaskName: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
  },
  weeklyTaskDate: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  weeklyTaskQty: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: 20,
    fontStyle: 'italic',
  },
  progressSection: {
    marginBottom: 16,
  },
  progressLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
    fontWeight: '500',
  },
  progressBarContainer: {
    height: 12,
    backgroundColor: '#e5e7eb',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#2563eb',
    borderRadius: 6,
  },
  progressValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2563eb',
    marginTop: 6,
    textAlign: 'right',
  },
  avgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  avgName: {
    flex: 1,
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
    paddingRight: 12,
  },
  avgValue: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '700',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  detailLabel: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 15,
    color: '#1f2937',
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  logoutButton: {
    backgroundColor: '#ef4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  logoutButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
