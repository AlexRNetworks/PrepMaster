import React, { useState, useMemo, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  SafeAreaView,
  Alert,
  Modal,
  TextInput,
  Image
} from 'react-native';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, orderBy, query, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useLocale } from '@/context/LocaleContext';
import ProfileModal from '@/components/ProfileModal';

type UserRole = 'IT_Admin' | 'Manager' | 'Employee';
type Priority = 'high' | 'medium' | 'low';

interface User {
  id: number;
  name: string;
  pin: string;
  role: UserRole;
  permissions: string[];
  active: boolean;
  createdAt: string;
}

interface PrepTask {
  id: number;
  name: string;
  qty: string;
  status: 'Incomplete' | 'In Progress' | 'Complete';
  notes: string;
  priority: Priority;
  completedBy?: number;
  completedAt?: string;
  startedAt?: string;
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

interface EmployeeDashboardProps {
  onLogout: () => void;
  currentUser: User;
  onNavigateToUserManagement: () => void;
  onNavigateToPrepSchedule?: () => void;
}

export default function EmployeeDashboard({ onLogout, currentUser, onNavigateToUserManagement, onNavigateToPrepSchedule }: EmployeeDashboardProps) {
  const { t } = useLocale();
  const [schedules, setSchedules] = useState<PrepSchedule[]>([]);
  const [scheduleDocIds, setScheduleDocIds] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState<'all' | 'incomplete' | 'complete'>('all');
  const [incompleteModalVisible, setIncompleteModalVisible] = useState(false);
  const [selectedTask, setSelectedTask] = useState<{ scheduleId: number; taskId: number } | null>(null);
  const [incompleteReason, setIncompleteReason] = useState('');
  const [profileModalVisible, setProfileModalVisible] = useState(false);

  // Subscribe to schedules from Firestore
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'schedules'), orderBy('date', 'asc'));
    const unsub = onSnapshot(q, snap => {
      const next: PrepSchedule[] = [];
      const docIds: Record<number, string> = {};
      snap.forEach(ds => {
        const data = ds.data() as any;
        if (typeof data?.id !== 'number') return;
        docIds[data.id] = ds.id;
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
      setScheduleDocIds(docIds);
    });
    return () => unsub();
  }, [currentUser]);

  // Get user's assigned schedules and aggregate tasks
  const mySchedules = useMemo(() => {
    if (!currentUser) return [];
    return schedules.filter(s => 
      s.primaryPrepPerson === currentUser.id || 
      s.additionalWorkers.includes(currentUser.id)
    );
  }, [schedules, currentUser]);

  const allTasks = useMemo(() => 
    mySchedules?.flatMap(s => s.tasks?.map(t => ({ ...t, scheduleId: s.id, scheduleDate: s.date })) || []) || [],
    [mySchedules]
  );

  const { completedCount, totalCount, completionRate, filteredTasks } = useMemo(() => {
    const total = allTasks?.length || 0;
    const completed = allTasks?.filter((t: PrepTask) => t.status === 'Complete').length || 0;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    let filtered = allTasks || [];
    if (filter === 'incomplete') {
      filtered = (allTasks || []).filter((t: PrepTask) => t.status !== 'Complete');
    } else if (filter === 'complete') {
      filtered = (allTasks || []).filter((t: PrepTask) => t.status === 'Complete');
    }
    return {
      completedCount: completed,
      totalCount: total,
      completionRate: rate,
      filteredTasks: filtered,
    };
  }, [allTasks, filter]);

  if (!currentUser) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: 'red', fontSize: 18 }}>Error: No user data provided.</Text>
      </View>
    );
  }

  const canManageUsers = currentUser.permissions.includes('manage_users');
  const isManagerOrAdmin = currentUser.role === 'IT_Admin' || currentUser.role === 'Manager';

  const getCurrentDate = () => {
    const date = new Date();
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const handleSignOff = () => {
    if (completedCount === 0) {
      Alert.alert(
        t('noTasksCompleted'),
        t('completeTasksFirst'),
        [{ text: "OK" }]
      );
      return;
    }

    Alert.alert(
      t('confirmSignOff'),
      `${t('submit')} ${completedCount} ${t('completed')} ${t('task')}${completedCount !== 1 ? 's' : ''} for ${currentUser.name}?`,
      [
        { text: t('cancel'), style: "cancel" },
        { 
          text: t('submit'), 
          style: "default",
          onPress: () => {
            Alert.alert(t('success'), t('tasksLoggedSuccess'), [
              { text: "OK" }]
            );
          }
        }
      ]
    );
  };

  const handleToggleTask = async (scheduleId: number, taskId: number, currentStatus: string) => {
    const docId = scheduleDocIds[scheduleId];
    if (!docId) return;

    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) return;

    let toggledTask: PrepTask | null = null;
    const updatedTasks = schedule.tasks.map(t => {
      if (t.id === taskId) {
        if (currentStatus === 'Complete') {
          // Unchecking - mark as incomplete
          const { completedBy, completedAt, ...rest } = t;
          toggledTask = { ...rest, status: 'Incomplete' } as PrepTask;
          return { ...rest, status: 'Incomplete' as const };
        } else {
          // Checking - mark as complete
          const finishedAt = new Date();
          let durationSeconds: number | undefined = undefined;
          if (t.startedAt) {
            try {
              const started = new Date(t.startedAt);
              durationSeconds = Math.max(0, Math.floor((finishedAt.getTime() - started.getTime()) / 1000));
            } catch {}
          }
          const completed: PrepTask = { 
            ...t, 
            status: 'Complete',
            completedBy: currentUser.id,
            completedAt: finishedAt.toISOString(),
          } as PrepTask;
          // Clear startedAt on completion
          delete (completed as any).startedAt;
          toggledTask = completed;
          return completed as any;
        }
      }
      return t;
    });

    try {
      await updateDoc(doc(db, 'schedules', docId), { tasks: updatedTasks });
      // Log prep action to Firestore
      if (toggledTask) {
        const action = currentStatus === 'Complete' ? 'reverted' : 'prepared';
        try {
          await addDoc(collection(db, 'prepLogs'), {
            scheduleId,
            scheduleDate: schedule.date,
            taskId,
            taskName: toggledTask.name,
            qty: toggledTask.qty,
            action,
            userId: currentUser.id,
            userName: currentUser.name,
            createdAt: serverTimestamp(),
            // Timing fields if applicable
            ...(action === 'prepared' && schedule.tasks.find(t => t.id === taskId && t.startedAt) ? {
              startedAt: schedule.tasks.find(t => t.id === taskId)?.startedAt,
              finishedAt: new Date().toISOString(),
              durationSeconds: (function() {
                try {
                  const started = new Date(schedule.tasks.find(t => t.id === taskId)?.startedAt as any);
                  const finished = new Date();
                  return Math.max(0, Math.floor((finished.getTime() - started.getTime()) / 1000));
                } catch { return undefined; }
              })(),
            } : {}),
          });
        } catch (e) {
          // Non-blocking: ignore logging errors
        }
      }
    } catch {
      Alert.alert(t('error'), t('failedUpdateTask'));
    }
  };

  const handleStartTask = async (scheduleId: number, taskId: number) => {
    const docId = scheduleDocIds[scheduleId];
    if (!docId) return;
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) return;

    const updatedTasks = schedule.tasks.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          status: 'In Progress' as const,
          startedAt: new Date().toISOString(),
        };
      }
      return t;
    });
    try {
      await updateDoc(doc(db, 'schedules', docId), { tasks: updatedTasks });
    } catch {
      Alert.alert(t('error'), t('failedUpdateTask'));
    }
  };

  const handleMarkIncomplete = (scheduleId: number, taskId: number) => {
    setSelectedTask({ scheduleId, taskId });
    setIncompleteModalVisible(true);
  };

  const handleSubmitIncompleteReason = async () => {
    if (!selectedTask || !incompleteReason.trim()) {
      Alert.alert(t('required'), t('provideIncompleteReason'));
      return;
    }

    const { scheduleId, taskId } = selectedTask;
    const docId = scheduleDocIds[scheduleId];
    if (!docId) return;

    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) return;

    const updatedTasks = schedule.tasks.map(t => {
      if (t.id === taskId) {
        const { completedBy, completedAt, ...rest } = t;
        return { 
          ...rest, 
          status: 'Incomplete' as const,
          notes: `${t.notes ? t.notes + '\n' : ''}[Incomplete] ${incompleteReason}`
        };
      }
      return t;
    });

    try {
      await updateDoc(doc(db, 'schedules', docId), { tasks: updatedTasks });
      setIncompleteModalVisible(false);
      setIncompleteReason('');
      setSelectedTask(null);
      Alert.alert(t('success'), t('taskMarkedIncomplete'));
    } catch {
      Alert.alert(t('error'), t('failedUpdateTask'));
    }
  };

  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case 'high': return '#e74c3c';
      case 'medium': return '#f39c12';
      case 'low': return '#3498db';
      default: return '#95a5a6';
    }
  };

  const getProgressColor = () => {
    if (completionRate >= 75) return '#2ecc71';
    if (completionRate >= 50) return '#f39c12';
    return '#e74c3c';
  };

  const getRoleDisplay = (role: UserRole) => {
    switch (role) {
      case 'IT_Admin': return t('itAdmin');
      case 'Manager': return t('manager');
      case 'Employee': return t('employee');
      default: return t('employee');
    }
  };

  // Early return if no current user (after all hooks)
  if (!currentUser) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Simple Top Bar */}
      <View style={styles.topBar}>
        <Image source={{ uri: 'https://i.ibb.co/7tmLxCNZ/Purple-Minimalist-People-Profile-Logo-1.png' }} style={styles.logo} />
        <TouchableOpacity 
          style={styles.profileButton} 
          onPress={() => setProfileModalVisible(true)}
          activeOpacity={0.8}
        >
          <IconSymbol name="person.fill" size={24} color="#2563eb" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Date Header */}
        <Text style={styles.dateText}>{getCurrentDate()}</Text>

      {/* Progress Card with Circular Progress */}
      <View style={styles.progressSection}>
        <View style={styles.progressCard}>
          <View style={styles.progressCircle}>
            <Text style={[styles.progressPercentage, { color: getProgressColor() }]}>
              {completionRate}%
            </Text>
            <Text style={styles.progressLabel}>{t('complete')}</Text>
          </View>
          <View style={styles.progressStats}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{completedCount}</Text>
              <Text style={styles.statLabel}>{t('done')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{totalCount - completedCount}</Text>
              <Text style={styles.statLabel}>{t('pending')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{totalCount}</Text>
              <Text style={styles.statLabel}>{t('total')}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* User Management Button (Only for Managers/IT Admins) */}
      {isManagerOrAdmin && canManageUsers && (
        <TouchableOpacity 
          style={styles.userManagementButton} 
          onPress={onNavigateToUserManagement}
          activeOpacity={0.8}
        >
          <Text style={styles.userManagementButtonText}>{t('manageUsers')}</Text>
        </TouchableOpacity>
      )}

      {/* Filter Buttons */}
      <View style={styles.filterContainer}>
        <TouchableOpacity 
          style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterButtonText, filter === 'all' && styles.filterButtonTextActive]}>
            {t('all')} ({totalCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.filterButton, filter === 'incomplete' && styles.filterButtonActive]}
          onPress={() => setFilter('incomplete')}
        >
          <Text style={[styles.filterButtonText, filter === 'incomplete' && styles.filterButtonTextActive]}>
            {t('pending')} ({totalCount - completedCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.filterButton, filter === 'complete' && styles.filterButtonActive]}
          onPress={() => setFilter('complete')}
        >
          <Text style={[styles.filterButtonText, filter === 'complete' && styles.filterButtonTextActive]}>
            {t('done')} ({completedCount})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Task List */}
      <Text style={styles.listTitle}>
        {filter === 'all' ? t('allTasks') : filter === 'incomplete' ? t('pendingTasks') : t('completedTasks')}
      </Text>
        {filteredTasks.map((task: any) => (
          <View
            key={`${task.scheduleId}-${task.id}`}
            style={[
              styles.taskItem,
              task.status === 'Complete' && styles.taskComplete,
            ]}
          >
            {/* Checkbox */}
            <TouchableOpacity
              style={styles.checkbox}
              onPress={() => handleToggleTask(task.scheduleId, task.id, task.status)}
            >
              <View style={[
                styles.checkboxBox,
                task.status === 'Complete' && styles.checkboxBoxChecked
              ]}>
                {task.status === 'Complete' && (
                  <IconSymbol name="checkmark.circle.fill" size={16} color="#ffffff" />
                )}
              </View>
            </TouchableOpacity>

            <View style={styles.taskLeft}>
              {task.priority && (
                <View 
                  style={[
                    styles.priorityIndicator, 
                    { backgroundColor: getPriorityColor(task.priority) }
                  ]} 
                />
              )}
              <View style={styles.taskInfo}>
                <Text style={[
                  styles.taskName,
                  task.status === 'Complete' && styles.taskNameComplete
                ]}>
                  {String(task.name || '')}
                </Text>
                <Text style={styles.taskQty}>📦 Required: {String(task.qty || '')}</Text>
                {task.priority && (
                  <Text style={[styles.priorityBadge, { color: getPriorityColor(task.priority) }]}>
                    {String(task.priority).toUpperCase()} PRIORITY
                  </Text>
                )}
                {task.status === 'In Progress' && (
                  <Text style={styles.inProgressBadge}>{t('inProgress')}</Text>
                )}
              </View>
            </View>
            
            {/* Right-side controls */}
            {task.status !== 'Complete' && (
              <TouchableOpacity
                style={styles.startButton}
                onPress={() => task.status === 'In Progress' 
                  ? handleToggleTask(task.scheduleId, task.id, task.status)
                  : handleStartTask(task.scheduleId, task.id)}
              >
                <Text style={styles.startButtonText}>{task.status === 'In Progress' ? t('markComplete') : 'Start'}</Text>
              </TouchableOpacity>
            )}
            {/* Mark Incomplete Button - only show for completed tasks */}
            {task.status === 'Complete' && (
              <TouchableOpacity
                style={styles.incompleteButton}
                onPress={() => handleMarkIncomplete(task.scheduleId, task.id)}
              >
                <Text style={styles.incompleteButtonText}>{t('markIncomplete')}</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
        {filteredTasks.length === 0 && (
          <View style={styles.emptyState}>
            <IconSymbol 
              name={mySchedules.length === 0 ? 'calendar' : 'checkmark.circle.fill'} 
              size={48} 
              color="#9ca3af" 
            />
            <Text style={styles.emptyStateText}>
              {mySchedules.length === 0 
                ? t('noSchedulesAssigned') 
                : filter === 'complete' 
                  ? t('noCompletedTasks') 
                  : t('noPendingTasks')}
            </Text>
            {mySchedules.length === 0 && onNavigateToPrepSchedule && (
              <TouchableOpacity style={styles.emptyStateButton} onPress={onNavigateToPrepSchedule}>
                <Text style={styles.emptyStateButtonText}>{t('viewAllSchedules')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        <View style={styles.bottomPadding} />

        {/* Sign Off Button */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={[
              styles.signOffButton,
              completedCount === 0 && styles.signOffButtonDisabled
            ]}
            onPress={handleSignOff}
            activeOpacity={0.8}
            disabled={completedCount === 0}
          >
            <Text style={styles.signOffButtonText}>
              {t('signOffSubmit')} ({completedCount} {t('task')}{completedCount !== 1 ? 's' : ''})
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Incomplete Reason Modal */}
      <Modal
        visible={incompleteModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIncompleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('markTaskIncomplete')}</Text>
            <Text style={styles.modalSubtitle}>{t('pleaseProvideReason')}</Text>
            
            <TextInput
              style={styles.modalInput}
              value={incompleteReason}
              onChangeText={setIncompleteReason}
              placeholder={t('enterReason')}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setIncompleteModalVisible(false);
                  setIncompleteReason('');
                  setSelectedTask(null);
                }}
              >
                <Text style={styles.modalButtonTextCancel}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSubmit]}
                onPress={handleSubmitIncompleteReason}
              >
                <Text style={styles.modalButtonTextSubmit}>{t('submit')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Profile Modal */}
      <ProfileModal
        visible={profileModalVisible}
        onClose={() => setProfileModalVisible(false)}
        user={currentUser}
        onLogout={() => {
          setProfileModalVisible(false);
          onLogout();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#ffffff',
  },
  logo: { width: 50, height: 50, borderRadius: 10 },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  dateText: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '500',
    marginBottom: 20,
  },
  userManagementButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 16,
  },
  userManagementButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  progressSection: {
    padding: 16,
  },
  progressCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 16,
  },
  progressCircle: {
    alignItems: 'center',
    marginBottom: 20,
  },
  progressPercentage: {
    fontSize: 56,
    fontWeight: '800',
    marginBottom: 4,
  },
  progressLabel: {
    fontSize: 14,
    color: '#7f8c8d',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  progressStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#7f8c8d',
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#ecf0f1',
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: '#2563eb',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  filterButtonTextActive: {
    color: '#ffffff',
  },
  taskListContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  listTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 12,
    color: '#111827',
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  taskComplete: {
    backgroundColor: '#e8f8f5',
    borderLeftWidth: 4,
    borderLeftColor: '#2ecc71',
  },
  taskLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  priorityIndicator: {
    width: 4,
    height: 40,
    borderRadius: 2,
    marginRight: 12,
  },
  taskInfo: {
    flex: 1,
  },
  taskName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  taskNameComplete: {
    color: '#7f8c8d',
    textDecorationLine: 'line-through',
  },
  taskQty: {
    fontSize: 13,
    color: '#7f8c8d',
    marginBottom: 4,
  },
  priorityBadge: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#95a5a6',
    fontWeight: '500',
    marginBottom: 16,
    textAlign: 'center',
  },
  emptyStateButton: {
    backgroundColor: '#3498db',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginTop: 8,
  },
  emptyStateButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  taskCardButton: {
    backgroundColor: '#3498db',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 8,
  },
  taskCardButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  bottomPadding: {
    height: 20,
  },
  buttonContainer: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#ecf0f1',
  },
  signOffButton: {
    backgroundColor: '#2ecc71',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#2ecc71',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  signOffButtonDisabled: {
    backgroundColor: '#95a5a6',
    shadowOpacity: 0,
    elevation: 0,
  },
  signOffButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  checkbox: {
    marginRight: 12,
  },
  checkboxBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  checkboxBoxChecked: {
    backgroundColor: '#10b981',
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  incompleteButton: {
    backgroundColor: '#e74c3c',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginLeft: 8,
  },
  incompleteButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  startButton: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginLeft: 8,
  },
  startButtonText: {
    color: '#0369a1',
    fontSize: 12,
    fontWeight: '700',
  },
  inProgressBadge: {
    marginTop: 6,
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#7f8c8d',
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 100,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#95a5a6',
  },
  modalButtonSubmit: {
    backgroundColor: '#2ecc71',
  },
  modalButtonTextCancel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonTextSubmit: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});