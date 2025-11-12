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
  TextInput
} from 'react-native';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, orderBy, query, doc, updateDoc } from 'firebase/firestore';

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
  status: 'Incomplete' | 'Complete';
  notes: string;
  priority: Priority;
  completedBy?: number;
  completedAt?: string;
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
  const [schedules, setSchedules] = useState<PrepSchedule[]>([]);
  const [scheduleDocIds, setScheduleDocIds] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState<'all' | 'incomplete' | 'complete'>('all');
  const [incompleteModalVisible, setIncompleteModalVisible] = useState(false);
  const [selectedTask, setSelectedTask] = useState<{ scheduleId: number; taskId: number } | null>(null);
  const [incompleteReason, setIncompleteReason] = useState('');

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
    mySchedules.flatMap(s => s.tasks.map(t => ({ ...t, scheduleId: s.id, scheduleDate: s.date }))),
    [mySchedules]
  );

  const { completedCount, totalCount, completionRate, filteredTasks } = useMemo(() => {
    const total = allTasks.length;
    const completed = allTasks.filter((t: PrepTask) => t.status === 'Complete').length;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    let filtered = allTasks;
    if (filter === 'incomplete') {
      filtered = allTasks.filter((t: PrepTask) => t.status === 'Incomplete');
    } else if (filter === 'complete') {
      filtered = allTasks.filter((t: PrepTask) => t.status === 'Complete');
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
        "No Tasks Completed",
        "You haven't completed any tasks yet. Complete at least one task before signing off.",
        [{ text: "OK" }]
      );
      return;
    }

    Alert.alert(
      "Confirm Sign Off",
      `Submit ${completedCount} completed task${completedCount !== 1 ? 's' : ''} for ${currentUser.name}?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Submit", 
          style: "default",
          onPress: () => {
            Alert.alert("Success!", "Your tasks have been logged successfully.", [
              { text: "OK" }
            ]);
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

    const updatedTasks = schedule.tasks.map(t => {
      if (t.id === taskId) {
        if (currentStatus === 'Complete') {
          // Unchecking - mark as incomplete
          const { completedBy, completedAt, ...rest } = t;
          return { ...rest, status: 'Incomplete' as const };
        } else {
          // Checking - mark as complete
          return { 
            ...t, 
            status: 'Complete' as const,
            completedBy: currentUser.id,
            completedAt: new Date().toISOString()
          };
        }
      }
      return t;
    });

    try {
      await updateDoc(doc(db, 'schedules', docId), { tasks: updatedTasks });
    } catch {
      Alert.alert('Error', 'Failed to update task status');
    }
  };

  const handleMarkIncomplete = (scheduleId: number, taskId: number) => {
    setSelectedTask({ scheduleId, taskId });
    setIncompleteModalVisible(true);
  };

  const handleSubmitIncompleteReason = async () => {
    if (!selectedTask || !incompleteReason.trim()) {
      Alert.alert('Required', 'Please provide a reason for marking this task incomplete.');
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
      Alert.alert('Success', 'Task marked as incomplete with reason.');
    } catch {
      Alert.alert('Error', 'Failed to update task');
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

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case 'IT_Admin': return '⚡';
      case 'Manager': return '👔';
      case 'Employee': return '👤';
      default: return '👤';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Enhanced Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerText}>PrepMaster Pro</Text>
            <Text style={styles.subHeaderText}>
              {getRoleIcon(currentUser.role)} {currentUser.name} ({currentUser.role})
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.logoutButton} 
            onPress={onLogout}
            activeOpacity={0.8}
          >
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.dateText}>📅 {getCurrentDate()}</Text>
        
        {/* User Management Button (Only for Managers/IT Admins) */}
        {isManagerOrAdmin && canManageUsers && (
          <TouchableOpacity 
            style={styles.userManagementButton} 
            onPress={onNavigateToUserManagement}
            activeOpacity={0.8}
          >
            <Text style={styles.userManagementButtonText}>👥 User Management</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Progress Card with Circular Progress */}
      <View style={styles.progressSection}>
        <View style={styles.progressCard}>
          <View style={styles.progressCircle}>
            <Text style={[styles.progressPercentage, { color: getProgressColor() }]}>
              {completionRate}%
            </Text>
            <Text style={styles.progressLabel}>Complete</Text>
          </View>
          <View style={styles.progressStats}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{completedCount}</Text>
              <Text style={styles.statLabel}>✅ Done</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{totalCount - completedCount}</Text>
              <Text style={styles.statLabel}>⏳ Pending</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{totalCount}</Text>
              <Text style={styles.statLabel}>📋 Total</Text>
            </View>
          </View>
        </View>

        {/* Filter Buttons */}
        <View style={styles.filterContainer}>
          <TouchableOpacity 
            style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
            onPress={() => setFilter('all')}
          >
            <Text style={[styles.filterButtonText, filter === 'all' && styles.filterButtonTextActive]}>
              All ({totalCount})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.filterButton, filter === 'incomplete' && styles.filterButtonActive]}
            onPress={() => setFilter('incomplete')}
          >
            <Text style={[styles.filterButtonText, filter === 'incomplete' && styles.filterButtonTextActive]}>
              Pending ({totalCount - completedCount})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.filterButton, filter === 'complete' && styles.filterButtonActive]}
            onPress={() => setFilter('complete')}
          >
            <Text style={[styles.filterButtonText, filter === 'complete' && styles.filterButtonTextActive]}>
              Done ({completedCount})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Task List */}
      <ScrollView 
        style={styles.taskListContainer}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.listTitle}>
          {filter === 'all' ? 'All Tasks' : filter === 'incomplete' ? 'Pending Tasks' : 'Completed Tasks'}
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
                {task.status === 'Complete' && <Text style={styles.checkmark}>✓</Text>}
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
              </View>
            </View>
            
            {/* Mark Incomplete Button - only show for completed tasks */}
            {task.status === 'Complete' && (
              <TouchableOpacity
                style={styles.incompleteButton}
                onPress={() => handleMarkIncomplete(task.scheduleId, task.id)}
              >
                <Text style={styles.incompleteButtonText}>Mark Incomplete</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
        {filteredTasks.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateEmoji}>
              {mySchedules.length === 0 ? '📅' : '🎉'}
            </Text>
            <Text style={styles.emptyStateText}>
              {mySchedules.length === 0 
                ? 'No prep schedules assigned to you yet' 
                : filter === 'complete' 
                  ? 'No completed tasks yet' 
                  : 'No pending tasks'}
            </Text>
            {mySchedules.length === 0 && onNavigateToPrepSchedule && (
              <TouchableOpacity style={styles.emptyStateButton} onPress={onNavigateToPrepSchedule}>
                <Text style={styles.emptyStateButtonText}>View All Schedules</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        <View style={styles.bottomPadding} />
      </ScrollView>

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
            ✓ Sign Off & Submit ({completedCount} Task{completedCount !== 1 ? 's' : ''})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Incomplete Reason Modal */}
      <Modal
        visible={incompleteModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIncompleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Mark Task Incomplete</Text>
            <Text style={styles.modalSubtitle}>Please provide a reason:</Text>
            
            <TextInput
              style={styles.modalInput}
              value={incompleteReason}
              onChangeText={setIncompleteReason}
              placeholder="Enter reason..."
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
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSubmit]}
                onPress={handleSubmitIncompleteReason}
              >
                <Text style={styles.modalButtonTextSubmit}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  header: {
    backgroundColor: '#2c3e50',
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4,
  },
  subHeaderText: {
    fontSize: 16,
    color: '#ecf0f1',
    fontWeight: '500',
  },
  dateText: {
    fontSize: 13,
    color: '#bdc3c7',
    fontWeight: '500',
    marginBottom: 12,
  },
  logoutButton: {
    backgroundColor: '#e74c3c',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    shadowColor: '#e74c3c',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  logoutButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  userManagementButton: {
    backgroundColor: '#3498db',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#3498db',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
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
    backgroundColor: '#ffffff',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  filterButtonActive: {
    backgroundColor: '#3498db',
    borderColor: '#3498db',
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7f8c8d',
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
    color: '#2c3e50',
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
    color: '#2c3e50',
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
    borderWidth: 2,
    borderColor: '#95a5a6',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  checkboxBoxChecked: {
    backgroundColor: '#2ecc71',
    borderColor: '#2ecc71',
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
    borderWidth: 1,
    borderColor: '#ddd',
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