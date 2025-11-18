import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Switch,
  SafeAreaView,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useUser } from '@/context/UserContext';

// --- TYPES ---
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

interface PrepDetailViewProps {
  schedule: PrepSchedule;
  currentUser: User;
  allUsers: User[];
  onBack: () => void;
  onUpdateSchedule: (updatedSchedule: PrepSchedule) => void;
  scheduleDocId?: string;
}

export default function PrepDetailView({ 
  schedule, 
  currentUser, 
  allUsers: _allUsersProp, 
  onBack,
  onUpdateSchedule,
  scheduleDocId,
}: PrepDetailViewProps) {
  const { allUsers } = useUser();
  const [localSchedule, setLocalSchedule] = useState<PrepSchedule>(schedule);
  const [notesModalVisible, setNotesModalVisible] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [taskNotes, setTaskNotes] = useState('');

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const getUserName = (userId: number) => {
    const user = allUsers.find(u => u.id === userId);
    return user ? user.name : 'Unknown User';
  };

  const isPrimaryWorker = currentUser.id === localSchedule.primaryPrepPerson;
  const isAdditionalWorker = localSchedule.additionalWorkers.includes(currentUser.id);
  const canCompleteTask = isPrimaryWorker || isAdditionalWorker;

  const { completedCount, totalCount, completionRate } = useMemo(() => {
    const total = localSchedule.tasks.length;
    const completed = localSchedule.tasks.filter(t => t.status === 'Complete').length;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return {
      completedCount: completed,
      totalCount: total,
      completionRate: rate,
    };
  }, [localSchedule.tasks]);

  const handleToggleTask = (taskId: number) => {
    const task = localSchedule.tasks.find(t => t.id === taskId);
    if (!task) return;

    // Check if user can complete tasks
    if (!canCompleteTask && task.status === 'Incomplete') {
      Alert.alert(
        'Access Denied',
        'Only the assigned prep person(s) can mark tasks as complete.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Toggle task status
    const updatedTasks: PrepTask[] = localSchedule.tasks.map<PrepTask>(t => {
      if (t.id === taskId) {
        if (t.status === 'Complete') {
          // Mark as incomplete - remove completedBy and completedAt
          const { completedBy, completedAt, ...rest } = t;
          return { ...rest, status: 'Incomplete' as const, notes: '' };
        } else {
          // Mark as complete
          return {
            ...t,
            status: 'Complete' as const,
            completedBy: currentUser.id,
            completedAt: new Date().toISOString(),
          };
        }
      }
      return t;
    });

    const updatedSchedule = { ...localSchedule, tasks: updatedTasks };
    setLocalSchedule(updatedSchedule);
    onUpdateSchedule(updatedSchedule);

    // Persist to Firestore
    if (scheduleDocId) {
      updateDoc(doc(db, 'schedules', scheduleDocId), { tasks: updatedTasks }).catch(e => {
        Alert.alert('Error', 'Failed to save task update: ' + (e?.message || 'Unknown error'));
      });
    }
  };

  const handleAddNotes = (taskId: number) => {
    const task = localSchedule.tasks.find(t => t.id === taskId);
    if (!task) return;

    setSelectedTaskId(taskId);
    setTaskNotes(task.notes);
    setNotesModalVisible(true);
  };

  const handleSaveNotes = () => {
    if (selectedTaskId === null) return;

    const updatedTasks = localSchedule.tasks.map(t =>
      t.id === selectedTaskId
        ? { ...t, notes: taskNotes }
        : t
    );

    const updatedSchedule = { ...localSchedule, tasks: updatedTasks };
    setLocalSchedule(updatedSchedule);
    onUpdateSchedule(updatedSchedule);
    
    setNotesModalVisible(false);
    setSelectedTaskId(null);
    setTaskNotes('');

    // Persist to Firestore
    if (scheduleDocId) {
      updateDoc(doc(db, 'schedules', scheduleDocId), { tasks: updatedTasks }).catch(e => {
        Alert.alert('Error', 'Failed to save notes: ' + (e?.message || 'Unknown error'));
      });
    }
  };

  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case 'high': return '#e74c3c';
      case 'medium': return '#f39c12';
      case 'low': return '#3498db';
    }
  };

  const getProgressColor = () => {
    if (completionRate >= 75) return '#2ecc71';
    if (completionRate >= 50) return '#f39c12';
    return '#e74c3c';
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerText}>Prep Details</Text>
        <Text style={styles.dateText}>{formatDate(localSchedule.date)}</Text>
      </View>

      {/* Progress Section */}
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
              <Text style={styles.statLabel}>Done</Text>
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

        {/* Workers Info Card */}
        <View style={styles.workersCard}>
          <Text style={styles.workersCardTitle}>👥 Assigned Team</Text>
          <View style={styles.workersList}>
            <View style={[styles.workerBadge, styles.primaryWorkerBadge]}>
              <Text style={styles.workerBadgeLabel}>Primary:</Text>
              <Text style={styles.workerBadgeName}>
                {getUserName(localSchedule.primaryPrepPerson)}
                {isPrimaryWorker && ' (You)'}
              </Text>
            </View>
            {localSchedule.additionalWorkers.length > 0 && (
              <View style={styles.workerBadge}>
                <Text style={styles.workerBadgeLabel}>Additional:</Text>
                <Text style={styles.workerBadgeName}>
                  {localSchedule.additionalWorkers.map(id => {
                    const name = getUserName(id);
                    return id === currentUser.id ? `${name} (You)` : name;
                  }).join(', ')}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Permission Notice */}
        {!canCompleteTask && (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeEmoji}>ℹ️</Text>
            <Text style={styles.noticeText}>
              You can view this prep schedule, but only assigned workers can complete tasks.
            </Text>
          </View>
        )}
      </View>

      {/* Task List */}
      <ScrollView style={styles.taskListContainer} showsVerticalScrollIndicator={false}>
        <Text style={styles.listTitle}>Prep Tasks ({totalCount})</Text>
        
        {localSchedule.tasks.map((task, index) => (
          <View
            key={task.id}
            style={[
              styles.taskCard,
              task.status === 'Complete' && styles.taskCardComplete,
            ]}
          >
            {/* Task Header */}
            <View style={styles.taskHeader}>
              <View style={styles.taskHeaderLeft}>
                <View 
                  style={[
                    styles.priorityIndicator, 
                    { backgroundColor: getPriorityColor(task.priority) }
                  ]} 
                />
                <View style={styles.taskInfo}>
                  <Text style={[
                    styles.taskName,
                    task.status === 'Complete' && styles.taskNameComplete
                  ]}>
                    {index + 1}. {task.name}
                  </Text>
                  <Text style={styles.taskQty}>📦 {task.qty}</Text>
                  <Text style={[
                    styles.priorityBadge, 
                    { color: getPriorityColor(task.priority) }
                  ]}>
                    {task.priority.toUpperCase()} PRIORITY
                  </Text>
                </View>
              </View>
              
              {/* Complete Switch */}
              <Switch
                value={task.status === 'Complete'}
                onValueChange={() => handleToggleTask(task.id)}
                disabled={!canCompleteTask && task.status === 'Incomplete'}
                trackColor={{ false: "#e0e0e0", true: "#2ecc71" }}
                thumbColor={task.status === 'Complete' ? "#ffffff" : "#f4f3f4"}
                ios_backgroundColor="#e0e0e0"
              />
            </View>

            {/* Task Details */}
            {task.status === 'Complete' && task.completedBy && (
              <View style={styles.completionInfo}>
                <Text style={styles.completionText}>
                  ✓ Completed by {getUserName(task.completedBy)}
                </Text>
                {task.completedAt && (
                  <Text style={styles.completionTime}>
                    {formatTime(task.completedAt)}
                  </Text>
                )}
              </View>
            )}

            {/* Notes Section */}
            {task.notes ? (
              <View style={styles.notesSection}>
                <Text style={styles.notesLabel}>📝 Notes:</Text>
                <Text style={styles.notesText}>{task.notes}</Text>
              </View>
            ) : null}

            {/* Add Notes Button */}
            {canCompleteTask && (
              <TouchableOpacity
                style={styles.addNotesButton}
                onPress={() => handleAddNotes(task.id)}
              >
                <Text style={styles.addNotesButtonText}>
                  {task.notes ? '✏️ Edit Notes' : '+ Add Notes'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ))}

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Complete All Button (Only for assigned workers) */}
      {canCompleteTask && completedCount < totalCount && (
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.completeAllButton}
            onPress={() => {
              Alert.alert(
                'Complete All Tasks?',
                'Mark all remaining tasks as complete?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Complete All',
                    onPress: () => {
                      const updatedTasks = localSchedule.tasks.map(t => ({
                        ...t,
                        status: 'Complete' as const,
                        completedBy: currentUser.id,
                        completedAt: new Date().toISOString(),
                      }));
                      const updatedSchedule = { ...localSchedule, tasks: updatedTasks };
                      setLocalSchedule(updatedSchedule);
                      onUpdateSchedule(updatedSchedule);

                      // Persist to Firestore
                      if (scheduleDocId) {
                        updateDoc(doc(db, 'schedules', scheduleDocId), { tasks: updatedTasks }).catch(e => {
                          Alert.alert('Error', 'Failed to save: ' + (e?.message || 'Unknown error'));
                        });
                      }
                    },
                  },
                ]
              );
            }}
          >
            <Text style={styles.completeAllButtonText}>
              ✓ Complete All Remaining Tasks
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Notes Modal */}
      <Modal
        visible={notesModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setNotesModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Task Notes</Text>
            <Text style={styles.modalSubtitle}>
              {localSchedule.tasks.find(t => t.id === selectedTaskId)?.name}
            </Text>

            <TextInput
              style={styles.notesInput}
              value={taskNotes}
              onChangeText={setTaskNotes}
              placeholder="Add any notes about this task..."
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setNotesModalVisible(false);
                  setSelectedTaskId(null);
                  setTaskNotes('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSaveNotes}
              >
                <Text style={styles.saveButtonText}>Save Notes</Text>
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
  backButton: {
    marginBottom: 12,
  },
  backButtonText: {
    color: '#3498db',
    fontSize: 16,
    fontWeight: '600',
  },
  headerText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4,
  },
  dateText: {
    fontSize: 16,
    color: '#ecf0f1',
    fontWeight: '500',
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
    marginBottom: 12,
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
  workersCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  workersCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 12,
  },
  workersList: {
    gap: 8,
  },
  workerBadge: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#95a5a6',
  },
  primaryWorkerBadge: {
    borderLeftColor: '#3498db',
    backgroundColor: '#e3f2fd',
  },
  workerBadgeLabel: {
    fontSize: 12,
    color: '#7f8c8d',
    fontWeight: '600',
    marginBottom: 4,
  },
  workerBadgeName: {
    fontSize: 15,
    color: '#2c3e50',
    fontWeight: '700',
  },
  noticeCard: {
    backgroundColor: '#fff3cd',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#f39c12',
  },
  noticeEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    color: '#856404',
    fontWeight: '500',
    lineHeight: 18,
  },
  taskListContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  listTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    color: '#2c3e50',
  },
  taskCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  taskCardComplete: {
    backgroundColor: '#e8f8f5',
    borderLeftWidth: 4,
    borderLeftColor: '#2ecc71',
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  taskHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  priorityIndicator: {
    width: 4,
    height: 50,
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
  completionInfo: {
    backgroundColor: '#d4edda',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  completionText: {
    fontSize: 13,
    color: '#155724',
    fontWeight: '600',
  },
  completionTime: {
    fontSize: 12,
    color: '#155724',
    fontWeight: '500',
  },
  notesSection: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7f8c8d',
    marginBottom: 4,
  },
  notesText: {
    fontSize: 14,
    color: '#2c3e50',
    lineHeight: 20,
  },
  addNotesButton: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addNotesButtonText: {
    fontSize: 13,
    color: '#7f8c8d',
    fontWeight: '600',
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
  completeAllButton: {
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
  completeAllButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 500,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#2c3e50',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#7f8c8d',
    marginBottom: 20,
  },
  notesInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#f8f9fa',
    height: 150,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#ecf0f1',
  },
  cancelButtonText: {
    color: '#7f8c8d',
    fontSize: 16,
    fontWeight: '700',
  },
  saveButton: {
    backgroundColor: '#2ecc71',
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});