import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  SafeAreaView,
  Modal,
} from 'react-native';

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

interface Task {
  id: number;
  name: string;
  qty: string;
  status: 'Incomplete' | 'Complete';
  notes: string;
  priority: Priority;
  assignedTo: number; // User ID
  assignedBy: number; // Manager/Admin ID
  createdAt: string;
  dueDate?: string;
}

interface TaskAssignmentProps {
  currentUser: User;
  onBack: () => void;
  allUsers: User[]; // Pass all users from parent
}

// --- INITIAL TASKS (with assignments) ---
const initialTasks: Task[] = [
  {
    id: 1,
    name: 'Slice 10 lbs Onions',
    qty: '10 lbs',
    status: 'Incomplete',
    notes: '',
    priority: 'high',
    assignedTo: 2, // John Doe
    assignedBy: 3, // Sarah Manager
    createdAt: new Date().toISOString(),
  },
  {
    id: 2,
    name: 'Make 2 Batches Ranch',
    qty: '2 batches',
    status: 'Complete',
    notes: '2 batches completed.',
    priority: 'medium',
    assignedTo: 2, // John Doe
    assignedBy: 1, // IT Admin
    createdAt: new Date().toISOString(),
  },
  {
    id: 3,
    name: 'Portion 2 cases Chicken',
    qty: '2 cases',
    status: 'Incomplete',
    notes: '',
    priority: 'high',
    assignedTo: 2, // John Doe
    assignedBy: 3, // Sarah Manager
    createdAt: new Date().toISOString(),
  },
];

export default function TaskAssignment({ currentUser, onBack, allUsers }: TaskAssignmentProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formQty, setFormQty] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formPriority, setFormPriority] = useState<Priority>('medium');
  const [formAssignedTo, setFormAssignedTo] = useState<number | null>(null);

  if (!currentUser) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: 'red', fontSize: 18 }}>Error: No user data provided.</Text>
      </View>
    );
  }

  // Check permissions
  const canAssignTasks = currentUser.permissions.includes('assign_tasks');
  const canEditTasks = currentUser.permissions.includes('edit_tasks');
  const canDeleteTasks = currentUser.permissions.includes('delete_tasks');

  // Filter users - only show employees
  const employees = allUsers.filter(u => u.role === 'Employee' && u.active);

  // --- HANDLERS ---
  const handleAddTask = () => {
    setEditingTask(null);
    setFormName('');
    setFormQty('');
    setFormNotes('');
    setFormPriority('medium');
    setFormAssignedTo(employees.length > 0 ? employees[0].id : null);
    setModalVisible(true);
  };

  const handleEditTask = (task: Task) => {
    if (!canEditTasks) {
      Alert.alert('Access Denied', 'You do not have permission to edit tasks.');
      return;
    }
    setEditingTask(task);
    setFormName(task.name);
    setFormQty(task.qty);
    setFormNotes(task.notes);
    setFormPriority(task.priority);
    setFormAssignedTo(task.assignedTo);
    setModalVisible(true);
  };

  const handleSaveTask = () => {
    if (!formName.trim()) {
      Alert.alert('Error', 'Please enter a task name.');
      return;
    }
    if (!formQty.trim()) {
      Alert.alert('Error', 'Please enter a quantity.');
      return;
    }
    if (!formAssignedTo) {
      Alert.alert('Error', 'Please select an employee to assign this task to.');
      return;
    }

    if (editingTask) {
      // Update existing task
      setTasks(prevTasks =>
        prevTasks.map(task =>
          task.id === editingTask.id
            ? {
                ...task,
                name: formName,
                qty: formQty,
                notes: formNotes,
                priority: formPriority,
                assignedTo: formAssignedTo,
              }
            : task
        )
      );
      Alert.alert('Success', 'Task updated successfully!');
    } else {
      // Create new task
      const newTask: Task = {
        id: Math.max(...tasks.map(t => t.id), 0) + 1,
        name: formName,
        qty: formQty,
        status: 'Incomplete',
        notes: formNotes,
        priority: formPriority,
        assignedTo: formAssignedTo,
        assignedBy: currentUser.id,
        createdAt: new Date().toISOString(),
      };
      setTasks(prevTasks => [...prevTasks, newTask]);
      Alert.alert('Success', 'Task assigned successfully!');
    }

    setModalVisible(false);
  };

  const handleDeleteTask = (taskId: number) => {
    if (!canDeleteTasks) {
      Alert.alert('Access Denied', 'You do not have permission to delete tasks.');
      return;
    }

    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this task?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setTasks(prevTasks => prevTasks.filter(t => t.id !== taskId));
            Alert.alert('Deleted', 'Task has been removed.');
          },
        },
      ]
    );
  };

  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case 'high': return '#e74c3c';
      case 'medium': return '#f39c12';
      case 'low': return '#3498db';
    }
  };

  const getStatusColor = (status: string) => {
    return status === 'Complete' ? '#2ecc71' : '#95a5a6';
  };

  const getUserName = (userId: number) => {
    const user = allUsers.find(u => u.id === userId);
    return user ? user.name : 'Unknown User';
  };

  if (!canAssignTasks) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerText}>Task Assignment</Text>
        </View>
        <View style={styles.accessDenied}>
          <Text style={styles.accessDeniedEmoji}>🔒</Text>
          <Text style={styles.accessDeniedText}>Access Denied</Text>
          <Text style={styles.accessDeniedSubtext}>
            You dont have permission to assign tasks.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerText}>Task Assignment</Text>
        <Text style={styles.subHeaderText}>
          Manage and assign tasks to employees
        </Text>
      </View>

      {/* Stats Card */}
      <View style={styles.statsCard}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{tasks.length}</Text>
          <Text style={styles.statLabel}>Total Tasks</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {tasks.filter(t => t.status === 'Incomplete').length}
          </Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {tasks.filter(t => t.status === 'Complete').length}
          </Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
      </View>

      {/* Task List */}
      <ScrollView style={styles.taskList} showsVerticalScrollIndicator={false}>
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>All Assigned Tasks</Text>
          <TouchableOpacity style={styles.addButton} onPress={handleAddTask}>
            <Text style={styles.addButtonText}>+ Assign Task</Text>
          </TouchableOpacity>
        </View>

        {tasks.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateEmoji}>📋</Text>
            <Text style={styles.emptyStateText}>No tasks assigned yet</Text>
            <Text style={styles.emptyStateSubtext}>
              Tap Assign Task to create your first task
            </Text>
          </View>
        ) : (
          tasks.map(task => (
            <View key={task.id} style={styles.taskCard}>
              {/* Task Header */}
              <View style={styles.taskHeader}>
                <View style={styles.taskTitleRow}>
                  <View
                    style={[
                      styles.priorityDot,
                      { backgroundColor: getPriorityColor(task.priority) },
                    ]}
                  />
                  <Text style={styles.taskName}>{task.name}</Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(task.status) },
                  ]}
                >
                  <Text style={styles.statusBadgeText}>{task.status}</Text>
                </View>
              </View>

              {/* Task Details */}
              <View style={styles.taskDetails}>
                <View style={styles.taskDetailRow}>
                  <Text style={styles.taskDetailLabel}>📦 Quantity:</Text>
                  <Text style={styles.taskDetailValue}>{task.qty}</Text>
                </View>

                <View style={styles.taskDetailRow}>
                  <Text style={styles.taskDetailLabel}>👤 Assigned To:</Text>
                  <Text style={styles.taskDetailValue}>
                    {getUserName(task.assignedTo)}
                  </Text>
                </View>

                <View style={styles.taskDetailRow}>
                  <Text style={styles.taskDetailLabel}>⚡ Priority:</Text>
                  <Text
                    style={[
                      styles.taskDetailValue,
                      { color: getPriorityColor(task.priority) },
                    ]}
                  >
                    {task.priority.toUpperCase()}
                  </Text>
                </View>

                <View style={styles.taskDetailRow}>
                  <Text style={styles.taskDetailLabel}>👔 Assigned By:</Text>
                  <Text style={styles.taskDetailValue}>
                    {getUserName(task.assignedBy)}
                  </Text>
                </View>

                {task.notes && (
                  <View style={styles.notesSection}>
                    <Text style={styles.notesLabel}>📝 Notes:</Text>
                    <Text style={styles.notesText}>{task.notes}</Text>
                  </View>
                )}
              </View>

              {/* Action Buttons */}
              <View style={styles.taskActions}>
                {canEditTasks && (
                  <TouchableOpacity
                    style={[styles.actionButton, styles.editButton]}
                    onPress={() => handleEditTask(task)}
                  >
                    <Text style={styles.actionButtonText}>✏️ Edit</Text>
                  </TouchableOpacity>
                )}
                {canDeleteTasks && (
                  <TouchableOpacity
                    style={[styles.actionButton, styles.deleteButton]}
                    onPress={() => handleDeleteTask(task.id)}
                  >
                    <Text style={[styles.actionButtonText, styles.deleteButtonText]}>
                      🗑️ Delete
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Add/Edit Task Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingTask ? 'Edit Task' : 'Assign New Task'}
            </Text>

            <ScrollView style={styles.modalForm}>
              <Text style={styles.inputLabel}>Task Name *</Text>
              <TextInput
                style={styles.input}
                value={formName}
                onChangeText={setFormName}
                placeholder="e.g., Slice 10 lbs Onions"
              />

              <Text style={styles.inputLabel}>Quantity *</Text>
              <TextInput
                style={styles.input}
                value={formQty}
                onChangeText={setFormQty}
                placeholder="e.g., 10 lbs, 2 batches"
              />

              <Text style={styles.inputLabel}>Assign To *</Text>
              <View style={styles.employeeSelector}>
                {employees.length === 0 ? (
                  <Text style={styles.noEmployeesText}>
                    No active employees available
                  </Text>
                ) : (
                  employees.map(employee => (
                    <TouchableOpacity
                      key={employee.id}
                      style={[
                        styles.employeeOption,
                        formAssignedTo === employee.id &&
                          styles.employeeOptionSelected,
                      ]}
                      onPress={() => setFormAssignedTo(employee.id)}
                    >
                      <Text
                        style={[
                          styles.employeeOptionText,
                          formAssignedTo === employee.id &&
                            styles.employeeOptionTextSelected,
                        ]}
                      >
                        👤 {employee.name}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>

              <Text style={styles.inputLabel}>Priority</Text>
              <View style={styles.prioritySelector}>
                {(['high', 'medium', 'low'] as Priority[]).map(priority => (
                  <TouchableOpacity
                    key={priority}
                    style={[
                      styles.priorityOption,
                      formPriority === priority && styles.priorityOptionSelected,
                      { borderColor: getPriorityColor(priority) },
                    ]}
                    onPress={() => setFormPriority(priority)}
                  >
                    <Text
                      style={[
                        styles.priorityOptionText,
                        formPriority === priority && {
                          color: getPriorityColor(priority),
                        },
                      ]}
                    >
                      {priority.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Notes (Optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formNotes}
                onChangeText={setFormNotes}
                placeholder="Add any special instructions..."
                multiline
                numberOfLines={3}
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSaveTask}
              >
                <Text style={styles.saveButtonText}>
                  {editingTask ? 'Save Changes' : 'Assign Task'}
                </Text>
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
  subHeaderText: {
    fontSize: 13,
    color: '#bdc3c7',
    fontWeight: '500',
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    margin: 16,
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 32,
    fontWeight: '800',
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
    backgroundColor: '#ecf0f1',
  },
  taskList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  listTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2c3e50',
  },
  addButton: {
    backgroundColor: '#2ecc71',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    shadowColor: '#2ecc71',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyStateEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#7f8c8d',
  },
  taskCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  taskTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  priorityDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  taskName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2c3e50',
    flex: 1,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  taskDetails: {
    marginBottom: 12,
  },
  taskDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  taskDetailLabel: {
    fontSize: 14,
    color: '#7f8c8d',
    fontWeight: '600',
  },
  taskDetailValue: {
    fontSize: 14,
    color: '#2c3e50',
    fontWeight: '600',
  },
  notesSection: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
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
  taskActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  editButton: {
    backgroundColor: '#3498db',
  },
  deleteButton: {
    backgroundColor: '#ffebee',
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  deleteButtonText: {
    color: '#e74c3c',
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
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#2c3e50',
    marginBottom: 20,
  },
  modalForm: {
    maxHeight: 500,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#34495e',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f8f9fa',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  employeeSelector: {
    gap: 8,
  },
  employeeOption: {
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#ffffff',
  },
  employeeOptionSelected: {
    borderColor: '#3498db',
    backgroundColor: '#e3f2fd',
  },
  employeeOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#7f8c8d',
  },
  employeeOptionTextSelected: {
    color: '#3498db',
  },
  noEmployeesText: {
    fontSize: 14,
    color: '#e74c3c',
    textAlign: 'center',
    padding: 20,
  },
  prioritySelector: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityOption: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  priorityOptionSelected: {
    backgroundColor: '#f8f9fa',
  },
  priorityOptionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7f8c8d',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
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
  accessDenied: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  accessDeniedEmoji: {
    fontSize: 80,
    marginBottom: 20,
  },
  accessDeniedText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#e74c3c',
    marginBottom: 8,
  },
  accessDeniedSubtext: {
    fontSize: 16,
    color: '#7f8c8d',
    textAlign: 'center',
  },
});