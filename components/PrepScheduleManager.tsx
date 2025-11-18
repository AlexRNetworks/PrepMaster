import React, { useEffect, useMemo, useState } from 'react';
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
  Image,
} from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useLocale } from '@/context/LocaleContext';
import { useUser } from '@/context/UserContext';
import { db } from '@/lib/firebase';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  // setDoc,
  // updateDoc,
  where,
  getDocs,
} from 'firebase/firestore';

// --- TYPES ---
type UserRole = 'IT_Admin' | 'Manager' | 'Employee';
type Priority = 'high' | 'medium' | 'low';

// --- PREDEFINED PREP ITEMS ---
const PREP_ITEMS = [
  // Tray items (1-4 trays)
  { name: 'Pancetta', unit: 'trays', qtyOptions: ['1', '2', '3', '4'] },
  { name: 'Roasted Veggies', unit: 'trays', qtyOptions: ['1', '2', '3', '4'] },
  { name: 'Sliced Potatoes', unit: 'trays', qtyOptions: ['1', '2', '3', '4'] },
  { name: 'Parm Potatoes', unit: 'trays', qtyOptions: ['1', '2', '3', '4'] },
  { name: '9oz Dough', unit: 'trays', qtyOptions: ['1', '2', '3', '4'] },
  { name: '6oz Dough', unit: 'trays', qtyOptions: ['1', '2', '3', '4'] },
  { name: 'Mushrooms', unit: 'half trays', qtyOptions: ['1', '2', '3', '4'] },
  // Quart container items (4qt or 8qt)
  { name: 'Slow Cooked Onions', unit: 'qt', qtyOptions: ['4', '8'] },
  { name: 'Black Olives', unit: 'qt', qtyOptions: ['4', '8'] },
  { name: 'Roasted Pepper Soup', unit: 'qt', qtyOptions: ['4', '8'] },
  { name: 'Red Onions', unit: 'qt', qtyOptions: ['4', '8'] },
  { name: 'Prosciutto', unit: 'qt', qtyOptions: ['4', '8'] },
  { name: 'Artichokes', unit: 'qt', qtyOptions: ['4', '8'] },
  { name: 'Peppadews', unit: 'qt', qtyOptions: ['4', '8'] },
];

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
  date: string; // ISO date string
  primaryPrepPerson: number; // User ID
  additionalWorkers: number[]; // User IDs
  tasks: PrepTask[];
  createdBy: number;
  createdAt: string;
}

interface PrepScheduleManagerProps {
  currentUser: User;
  onBack: () => void;
  allUsers: User[];
  prepSchedules?: PrepSchedule[];
  onUpdateSchedules?: (schedules: PrepSchedule[]) => void;
  onViewSchedule?: (schedule: PrepSchedule, docId: string) => void;
}

// --- INITIAL SCHEDULES (Sample Data) ---
// Reference example; Firestore provides live data
// const initialSchedules: PrepSchedule[] = [];

export default function PrepScheduleManager({ currentUser, onBack, allUsers: _allUsersProp, onViewSchedule }: PrepScheduleManagerProps) {
  const { t } = useLocale();
  const { allUsers, usersLoaded } = useUser();
  const [schedules, setSchedules] = useState<PrepSchedule[]>([]);
  const [scheduleDocIds, setScheduleDocIds] = useState<Record<number, string>>({});
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedPrimaryWorker, setSelectedPrimaryWorker] = useState<number | null>(null);
  const [selectedAdditionalWorkers, setSelectedAdditionalWorkers] = useState<number[]>([]);
  const [taskName, setTaskName] = useState('');
  const [taskQty, setTaskQty] = useState('');
  const [taskPriority, setTaskPriority] = useState<Priority>('medium');
  const [tasksList, setTasksList] = useState<PrepTask[]>([]);
  const [dateForecasts, setDateForecasts] = useState<Array<{ itemName: string; predictedQty: number }>>([]);
  const [showPrepItemPicker, setShowPrepItemPicker] = useState(false);
  const [selectedPrepItem, setSelectedPrepItem] = useState<{ name: string; unit: string; qtyOptions: string[] } | null>(null);
  const [showQtyPicker, setShowQtyPicker] = useState(false);

  const canManagePrep = currentUser.permissions.includes('assign_tasks') || 
                        currentUser.role === 'Manager' || 
                        currentUser.role === 'IT_Admin';

  const canCreateSchedules = currentUser.role === 'Manager' || currentUser.role === 'IT_Admin';

  const employees = useMemo(
    () => allUsers.filter(u => u.active && (u.role === 'Employee' || u.role === 'Manager')),
    [allUsers]
  );
  const effectiveEmployees = employees.length > 0 ? employees : (currentUser ? [currentUser] : []);

  // Realtime subscription to Firestore schedules
  useEffect(() => {
    const q = query(collection(db, 'schedules'), orderBy('date', 'asc'));
    const unsub = onSnapshot(q, snap => {
      const next: PrepSchedule[] = [];
      const idMap: Record<number, string> = {};
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
        idMap[data.id] = docSnap.id;
      });
      setSchedules(next);
      setScheduleDocIds(idMap);
    });
    return () => unsub();
  }, []);

  // Load forecasts for selected date when modal is open
  useEffect(() => {
    const load = async () => {
      if (!modalVisible || !selectedDate) { setDateForecasts([]); return; }
      try {
        const q = query(collection(db, 'prepForecasts'), where('date', '==', selectedDate));
        const snap = await getDocs(q);
        const rows: Array<{ itemName: string; predictedQty: number }> = [];
        snap.forEach(d => {
          const data = d.data() as any;
          if (typeof data?.itemName === 'string') {
            rows.push({ itemName: data.itemName, predictedQty: Number(data.predictedQty || 0) });
          }
        });
        rows.sort((a,b) => b.predictedQty - a.predictedQty);
        setDateForecasts(rows.slice(0, 10));
      } catch {
        setDateForecasts([]);
      }
    };
    load();
  }, [modalVisible, selectedDate]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const getTodayDateString = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const getNextSevenDays = () => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }
    return dates;
  };

  const getUserName = (userId: number) => {
    const user = allUsers.find(u => u.id === userId);
    return user ? user.name : 'Unknown User';
  };

  const handleCreateSchedule = () => {
    if (!usersLoaded) {
      Alert.alert('Loading', 'Employees are still loading. Please try again in a moment.');
      return;
    }
    setModalVisible(true);
    setSelectedDate(getTodayDateString());
    setSelectedPrimaryWorker(effectiveEmployees[0]?.id || currentUser.id);
    setSelectedAdditionalWorkers([]);
    setTasksList([]);
  };

  const handleAddTaskToList = () => {
    if (!selectedPrepItem || !taskQty) {
      Alert.alert('Error', 'Please select a prep item and quantity.');
      return;
    }

    const newTask: PrepTask = {
      id: Date.now(),
      name: selectedPrepItem.name,
      qty: `${taskQty} ${selectedPrepItem.unit}`,
      status: 'Incomplete',
      notes: '',
      priority: taskPriority,
    };

    setTasksList([...tasksList, newTask]);
    setSelectedPrepItem(null);
    setTaskQty('');
    setTaskPriority('medium');
  };

  const handleRemoveTaskFromList = (taskId: number) => {
    setTasksList(tasksList.filter(t => t.id !== taskId));
  };

  const handleSaveSchedule = async () => {
    if (!selectedDate || !selectedPrimaryWorker) {
      Alert.alert('Error', 'Please select a date and primary prep person.');
      return;
    }

    if (tasksList.length === 0) {
      Alert.alert('Error', 'Please add at least one task to the schedule.');
      return;
    }

    // Check if schedule already exists for this date
    const existingSchedule = schedules.find(s => s.date === selectedDate);
    if (existingSchedule) {
      Alert.alert('Error', `A prep schedule already exists for ${formatDate(selectedDate)}.`);
      return;
    }

    const newSchedule: PrepSchedule = {
      id: Math.max(...schedules.map(s => s.id), 0) + 1,
      date: selectedDate,
      primaryPrepPerson: selectedPrimaryWorker,
      additionalWorkers: selectedAdditionalWorkers,
      tasks: tasksList,
      createdBy: currentUser.id,
      createdAt: new Date().toISOString(),
    };

    try {
      await addDoc(collection(db, 'schedules'), {
        ...newSchedule,
        createdAt: serverTimestamp(),
      });
      Alert.alert('Success!', 'Prep schedule created successfully!');
      setModalVisible(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save schedule');
    }
  };

  const handleToggleAdditionalWorker = (workerId: number) => {
    if (selectedAdditionalWorkers.includes(workerId)) {
      setSelectedAdditionalWorkers(selectedAdditionalWorkers.filter(id => id !== workerId));
    } else {
      setSelectedAdditionalWorkers([...selectedAdditionalWorkers, workerId]);
    }
  };

  const handleDeleteSchedule = (scheduleId: number) => {
    Alert.alert(
      t('confirmDelete'),
      t('confirmDeleteSchedule'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            const docId = scheduleDocIds[scheduleId];
            if (!docId) {
              Alert.alert(t('error'), t('scheduleNotFound'));
              return;
            }
            try {
              await deleteDoc(doc(db, 'schedules', docId));
              Alert.alert(t('deleted'), t('scheduleRemoved'));
            } catch (e: any) {
              Alert.alert(t('error'), e?.message || t('failedDeleteSchedule'));
            }
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

  const getScheduleStats = (schedule: PrepSchedule) => {
    const total = schedule.tasks.length;
    const completed = schedule.tasks.filter(t => t.status === 'Complete').length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percentage };
  };

  if (!canManagePrep) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <Image
            source={{ uri: 'https://i.ibb.co/7tmLxCNZ/Purple-Minimalist-People-Profile-Logo-1.png' }}
            style={styles.logo}
          />
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Text style={styles.pageTitle}>Prep Schedules</Text>
          <Text style={styles.pageSubtitle}>View your assigned prep schedules</Text>

          {/* Stats Card - Show user's schedules only */}
          <View style={styles.statsCard}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {schedules.filter(s => 
                  s.primaryPrepPerson === currentUser.id || 
                  s.additionalWorkers.includes(currentUser.id)
                ).length}
              </Text>
              <Text style={styles.statLabel}>Your Schedules</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {schedules.filter(s => 
                  (s.primaryPrepPerson === currentUser.id || s.additionalWorkers.includes(currentUser.id)) &&
                  s.date >= getTodayDateString()
                ).length}
              </Text>
              <Text style={styles.statLabel}>Upcoming</Text>
            </View>
          </View>

          {/* Schedule List - Only show user's assigned schedules */}
          <ScrollView style={styles.scheduleList} showsVerticalScrollIndicator={false}>
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>My Prep Schedules</Text>
            </View>

          {schedules
            .filter(s => s.primaryPrepPerson === currentUser.id || s.additionalWorkers.includes(currentUser.id))
            .map(schedule => {
              const stats = getScheduleStats(schedule);
              const isPast = schedule.date < getTodayDateString();
              
              return (
                <View key={schedule.id} style={[styles.scheduleCard, isPast && styles.pastSchedule]}>
                  {/* Schedule Header */}
                  <View style={styles.scheduleHeader}>
                    <View>
                      <Text style={styles.scheduleDate}>{formatDate(schedule.date)}</Text>
                      <Text style={styles.scheduleSubtext}>
                        Created by {getUserName(schedule.createdBy)}
                      </Text>
                    </View>
                  </View>

                  {/* Progress Bar */}
                  <View style={styles.progressContainer}>
                    <View style={styles.progressBar}>
                      <View 
                        style={[
                          styles.progressFill, 
                          { width: `${stats.percentage}%` }
                        ]} 
                      />
                    </View>
                    <Text style={styles.progressText}>
                      {stats.completed}/{stats.total} ({stats.percentage}%)
                    </Text>
                  </View>

                  {/* Workers Section */}
                  <View style={styles.workersSection}>
                    <View style={styles.workerItem}>
                      <Text style={styles.workerLabel}>Primary Prep:</Text>
                      <Text style={styles.workerName}>
                        {getUserName(schedule.primaryPrepPerson)}
                      </Text>
                    </View>
                    {schedule.additionalWorkers.length > 0 && (
                      <View style={styles.workerItem}>
                        <Text style={styles.workerLabel}>Additional Help:</Text>
                        <Text style={styles.workerName}>
                          {schedule.additionalWorkers.map(id => getUserName(id)).join(', ')}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Tasks Preview */}
                  <View style={styles.tasksPreview}>
                    <Text style={styles.tasksPreviewTitle}>Tasks ({schedule.tasks.length})</Text>
                    {schedule.tasks.slice(0, 3).map(task => (
                      <View key={task.id} style={styles.taskPreviewItem}>
                        <View 
                          style={[
                            styles.taskPreviewDot, 
                            { backgroundColor: task.status === 'Complete' ? '#2ecc71' : '#95a5a6' }
                          ]} 
                        />
                        <Text style={styles.taskPreviewText}>{task.name}</Text>
                      </View>
                    ))}
                    {schedule.tasks.length > 3 && (
                      <Text style={styles.moreTasksText}>
                        +{schedule.tasks.length - 3} more tasks...
                      </Text>
                    )}
                  </View>

                  {/* View Details Button */}
                  <TouchableOpacity 
                    style={styles.viewDetailsButton}
                    onPress={() => {
                      const docId = scheduleDocIds[schedule.id];
                      if (docId && onViewSchedule) {
                        onViewSchedule(schedule, docId);
                      }
                    }}
                  >
                    <Text style={styles.viewDetailsButtonText}>View & Complete Tasks →</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          <View style={styles.bottomPadding} />
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <Image
          source={{ uri: 'https://i.ibb.co/7tmLxCNZ/Purple-Minimalist-People-Profile-Logo-1.png' }}
          style={styles.logo}
        />
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.pageTitle}>Prep Schedule Manager</Text>
        <Text style={styles.pageSubtitle}>Create and manage weekly prep schedules</Text>

        {/* Stats Card */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{schedules.length}</Text>
            <Text style={styles.statLabel}>Scheduled Days</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {schedules.reduce((sum, s) => sum + s.tasks.length, 0)}
            </Text>
            <Text style={styles.statLabel}>{t('totalTasks')}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {schedules.filter(s => s.date >= getTodayDateString()).length}
            </Text>
            <Text style={styles.statLabel}>{t('upcoming')}</Text>
          </View>
        </View>

        {/* Schedule List */}
        <ScrollView style={styles.scheduleList} showsVerticalScrollIndicator={false}>
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>{t('prepSchedules')}</Text>
            {canCreateSchedules && (
              <TouchableOpacity
                style={styles.addButton}
                onPress={handleCreateSchedule}
                disabled={!usersLoaded}
              >
                <Text style={styles.addButtonText}>
                  {!usersLoaded ? 'Loading…' : `+ ${t('createSchedule')}`}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {schedules.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>{t('noSchedulesYet')}</Text>
              <Text style={styles.emptyStateSubtext}>
                {t('createFirstSchedule')}
              </Text>
            </View>
        ) : (
          schedules.map(schedule => {
            const stats = getScheduleStats(schedule);
            const isPast = schedule.date < getTodayDateString();
            
            return (
              <View key={schedule.id} style={[styles.scheduleCard, isPast && styles.pastSchedule]}>
                {/* Schedule Header */}
                <View style={styles.scheduleHeader}>
                  <View>
                    <Text style={styles.scheduleDate}>{formatDate(schedule.date)}</Text>
                    <Text style={styles.scheduleSubtext}>
                      {t('createdBy')} {getUserName(schedule.createdBy)}
                    </Text>
                  </View>
                  {canManagePrep && (
                    <TouchableOpacity
                      style={styles.deleteScheduleButton}
                      onPress={() => handleDeleteSchedule(schedule.id)}
                    >
                      <Text style={styles.deleteScheduleButtonText}>🗑️</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Progress Bar */}
                <View style={styles.progressContainer}>
                  <View style={styles.progressBar}>
                    <View 
                      style={[
                        styles.progressFill, 
                        { width: `${stats.percentage}%` }
                      ]} 
                    />
                  </View>
                  <Text style={styles.progressText}>
                    {stats.completed}/{stats.total} ({stats.percentage}%)
                  </Text>
                </View>

                {/* Workers Section */}
                <View style={styles.workersSection}>
                  <View style={styles.workerItem}>
                    <Text style={styles.workerLabel}>Primary Prep:</Text>
                    <Text style={styles.workerName}>
                      {getUserName(schedule.primaryPrepPerson)}
                    </Text>
                  </View>
                  {schedule.additionalWorkers.length > 0 && (
                    <View style={styles.workerItem}>
                      <Text style={styles.workerLabel}>Additional Help:</Text>
                      <Text style={styles.workerName}>
                        {schedule.additionalWorkers.map(id => getUserName(id)).join(', ')}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Tasks Preview */}
                <View style={styles.tasksPreview}>
                  <Text style={styles.tasksPreviewTitle}>Tasks ({schedule.tasks.length})</Text>
                  {schedule.tasks.slice(0, 3).map(task => (
                    <View key={task.id} style={styles.taskPreviewItem}>
                      <View 
                        style={[
                          styles.taskPreviewDot, 
                          { backgroundColor: task.status === 'Complete' ? '#2ecc71' : '#95a5a6' }
                        ]} 
                      />
                      <Text style={styles.taskPreviewText}>{task.name}</Text>
                    </View>
                  ))}
                  {schedule.tasks.length > 3 && (
                    <Text style={styles.moreTasksText}>
                      +{schedule.tasks.length - 3} more tasks...
                    </Text>
                  )}
                </View>

                {/* View Details Button */}
                <TouchableOpacity 
                  style={styles.viewDetailsButton}
                  onPress={() => {
                    const docId = scheduleDocIds[schedule.id];
                    if (docId && onViewSchedule) {
                      onViewSchedule(schedule, docId);
                    }
                  }}
                >
                  <Text style={styles.viewDetailsButtonText}>View Prep Details →</Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
        <View style={styles.bottomPadding} />
      </ScrollView>
      </View>

      {/* Create Schedule Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create Prep Schedule</Text>

            <ScrollView style={styles.modalForm} showsVerticalScrollIndicator={false}>
              {/* Forecast Suggestions */}
              <Text style={styles.inputLabel}>{t('suggestedPrep')}</Text>
              {dateForecasts.length === 0 ? (
                <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>{t('forecastEmpty')}</Text>
              ) : (
                <View style={{ marginBottom: 8 }}>
                  {dateForecasts.map((f, idx) => {
                    const roundedQty = Math.ceil(f.predictedQty);
                    const unit = roundedQty === 1 ? 'tray' : 'trays';
                    return (
                      <View key={`${f.itemName}-${idx}`} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                        <Text style={{ fontSize: 13, color: '#111827' }}>{f.itemName}</Text>
                        <Text style={{ fontSize: 13, color: '#2563eb', fontWeight: '700' }}>{roundedQty} {unit}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
              {/* Date Selection */}
              <Text style={styles.inputLabel}>Select Date *</Text>
              <View style={styles.dateSelector}>
                {getNextSevenDays().map(date => (
                  <TouchableOpacity
                    key={date}
                    style={[
                      styles.dateOption,
                      selectedDate === date && styles.dateOptionSelected,
                    ]}
                    onPress={() => setSelectedDate(date)}
                  >
                    <Text style={[
                      styles.dateOptionText,
                      selectedDate === date && styles.dateOptionTextSelected,
                    ]}>
                      {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Primary Worker Selection */}
              <Text style={styles.inputLabel}>Primary Prep Person *</Text>
              <View style={styles.workerSelector}>
                {employees.map(worker => (
                  <TouchableOpacity
                    key={worker.id}
                    style={[
                      styles.workerOption,
                      selectedPrimaryWorker === worker.id && styles.workerOptionSelected,
                    ]}
                    onPress={() => setSelectedPrimaryWorker(worker.id)}
                  >
                    <Text style={[
                      styles.workerOptionText,
                      selectedPrimaryWorker === worker.id && styles.workerOptionTextSelected,
                    ]}>
                      {worker.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Additional Workers */}
              <Text style={styles.inputLabel}>Additional Workers (Optional)</Text>
              <View style={styles.workerSelector}>
                {employees
                  .filter(w => w.id !== selectedPrimaryWorker)
                  .map(worker => (
                    <TouchableOpacity
                      key={worker.id}
                      style={[
                        styles.workerOption,
                        selectedAdditionalWorkers.includes(worker.id) && styles.workerOptionSelected,
                      ]}
                      onPress={() => handleToggleAdditionalWorker(worker.id)}
                    >
                      <Text style={[
                        styles.workerOptionText,
                        selectedAdditionalWorkers.includes(worker.id) && styles.workerOptionTextSelected,
                      ]}>
                        {worker.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </View>

              {/* Add Tasks Section */}
              <Text style={styles.inputLabel}>Add Tasks *</Text>
              <View style={styles.taskInputSection}>
                {/* Prep Item Picker */}
                <TouchableOpacity
                  style={styles.prepItemPickerButton}
                  onPress={() => {
                    console.log('Prep item picker button pressed');
                    console.log('Current showPrepItemPicker state:', showPrepItemPicker);
                    setShowPrepItemPicker(!showPrepItemPicker);
                    console.log('Set showPrepItemPicker to true');
                  }}
                >
                  <Text style={selectedPrepItem ? styles.prepItemPickerTextSelected : styles.prepItemPickerTextPlaceholder}>
                    {selectedPrepItem ? selectedPrepItem.name : 'Select Prep Item'}
                  </Text>
                  <IconSymbol name={showPrepItemPicker ? "chevron.up" : "chevron.down"} size={16} color="#6b7280" />
                </TouchableOpacity>
                
                {/* Inline Prep Item List (Dropdown) */}
                {showPrepItemPicker && (
                  <View style={styles.prepItemDropdown}>
                    <ScrollView style={styles.prepItemDropdownScroll} nestedScrollEnabled>
                      {PREP_ITEMS.map((item, index) => (
                        <TouchableOpacity
                          key={index}
                          style={[
                            styles.dropdownItem,
                            selectedPrepItem?.name === item.name && styles.dropdownItemSelected,
                          ]}
                          onPress={() => {
                            setSelectedPrepItem(item);
                            setTaskQty('');
                            setShowPrepItemPicker(false);
                          }}
                        >
                          <View>
                            <Text style={styles.dropdownItemName}>{item.name}</Text>
                            <Text style={styles.dropdownItemUnit}>{item.unit}</Text>
                          </View>
                          {selectedPrepItem?.name === item.name && (
                            <Text style={{ color: '#2563eb', fontSize: 18 }}>✓</Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
                
                {/* Quantity Picker Buttons */}
                {selectedPrepItem && (
                  <View>
                    <Text style={styles.qtyLabel}>Select Quantity</Text>
                    <View style={styles.qtyOptionsRow}>
                      {selectedPrepItem.qtyOptions.map((qty) => (
                        <TouchableOpacity
                          key={qty}
                          style={[
                            styles.qtyOptionButton,
                            taskQty === qty && styles.qtyOptionButtonSelected,
                          ]}
                          onPress={() => setTaskQty(qty)}
                        >
                          <Text style={[
                            styles.qtyOptionText,
                            taskQty === qty && styles.qtyOptionTextSelected,
                          ]}>
                            {qty} {selectedPrepItem.unit}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
                
                <View style={styles.priorityRow}>
                  <Text style={styles.priorityLabel}>Priority:</Text>
                  {(['high', 'medium', 'low'] as Priority[]).map(priority => (
                    <TouchableOpacity
                      key={priority}
                      style={[
                        styles.priorityChip,
                        taskPriority === priority && { 
                          backgroundColor: getPriorityColor(priority) 
                        },
                      ]}
                      onPress={() => setTaskPriority(priority)}
                    >
                      <Text style={[
                        styles.priorityChipText,
                        taskPriority === priority && styles.priorityChipTextSelected,
                      ]}>
                        {priority.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity style={styles.addTaskButton} onPress={handleAddTaskToList}>
                  <Text style={styles.addTaskButtonText}>+ Add Task</Text>
                </TouchableOpacity>
              </View>

              {/* Tasks List */}
              {tasksList.length > 0 && (
                <View style={styles.tasksListSection}>
                  <Text style={styles.tasksListTitle}>Tasks ({tasksList.length})</Text>
                  {tasksList.map(task => (
                    <View key={task.id} style={styles.taskListItem}>
                      <View style={styles.taskListItemContent}>
                        <View 
                          style={[
                            styles.taskPriorityIndicator, 
                            { backgroundColor: getPriorityColor(task.priority) }
                          ]} 
                        />
                        <View style={styles.taskListItemText}>
                          <Text style={styles.taskListItemName}>{task.name}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <IconSymbol name="cube.box.fill" size={12} color="#6b7280" />
                            <Text style={styles.taskListItemQty}>{task.qty}</Text>
                          </View>
                        </View>
                      </View>
                      <TouchableOpacity 
                        onPress={() => handleRemoveTaskFromList(task.id)}
                        style={styles.removeTaskButton}
                      >
                        <Text style={styles.removeTaskButtonText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
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
                onPress={handleSaveSchedule}
              >
                <Text style={styles.saveButtonText}>Create Schedule</Text>
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
    backgroundColor: '#ffffff',
    paddingTop: 50,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#ffffff',
  },
  logo: { width: 50, height: 50, borderRadius: 10 },
  backButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#2563eb',
    fontSize: 15,
    fontWeight: '600',
  },
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
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#e5e7eb',
  },
  scheduleList: {
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
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  addButton: {
    backgroundColor: '#10b981',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
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
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#6b7280',
  },
  scheduleCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  pastSchedule: {
    opacity: 0.7,
  },
  scheduleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  scheduleDate: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  scheduleSubtext: {
    fontSize: 12,
    color: '#6b7280',
  },
  deleteScheduleButton: {
    padding: 8,
  },
  deleteScheduleButtonText: {
    fontSize: 20,
  },
  progressContainer: {
    marginBottom: 12,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#ecf0f1',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10b981',
  },
  progressText: {
    fontSize: 12,
    color: '#7f8c8d',
    fontWeight: '600',
  },
  workersSection: {
    marginBottom: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#ecf0f1',
  },
  workerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  workerLabel: {
    fontSize: 13,
    color: '#7f8c8d',
    fontWeight: '600',
    marginRight: 8,
  },
  workerName: {
    fontSize: 13,
    color: '#2c3e50',
    fontWeight: '700',
  },
  tasksPreview: {
    marginBottom: 12,
  },
  tasksPreviewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 8,
  },
  taskPreviewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  taskPreviewDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  taskPreviewText: {
    fontSize: 13,
    color: '#34495e',
  },
  moreTasksText: {
    fontSize: 12,
    color: '#7f8c8d',
    fontStyle: 'italic',
    marginTop: 4,
  },
  viewDetailsButton: {
    backgroundColor: '#3498db',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  viewDetailsButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  bottomPadding: {
    height: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
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
  dateSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dateOption: {
    flex: 1,
    minWidth: 80,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  dateOptionSelected: {
    borderColor: '#3498db',
    backgroundColor: '#e3f2fd',
  },
  dateOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7f8c8d',
  },
  dateOptionTextSelected: {
    color: '#3498db',
  },
  workerSelector: {
    gap: 8,
  },
  workerOption: {
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 12,
  },
  workerOptionSelected: {
    borderColor: '#3498db',
    backgroundColor: '#e3f2fd',
  },
  workerOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7f8c8d',
  },
  workerOptionTextSelected: {
    color: '#3498db',
  },
  taskInputSection: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  taskInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    fontSize: 14,
  },
  priorityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  priorityLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#34495e',
  },
  priorityChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#e0e0e0',
  },
  priorityChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7f8c8d',
  },
  priorityChipTextSelected: {
    color: '#ffffff',
  },
  addTaskButton: {
    backgroundColor: '#2ecc71',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  addTaskButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  tasksListSection: {
    marginTop: 12,
  },
  tasksListTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 8,
  },
  taskListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  taskListItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  taskPriorityIndicator: {
    width: 4,
    height: 30,
    borderRadius: 2,
    marginRight: 10,
  },
  taskListItemText: {
    flex: 1,
  },
  taskListItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 2,
  },
  taskListItemQty: {
    fontSize: 12,
    color: '#7f8c8d',
  },
  removeTaskButton: {
    padding: 8,
  },
  removeTaskButtonText: {
    fontSize: 18,
    color: '#e74c3c',
    fontWeight: '700',
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
  prepItemPickerButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    marginBottom: 12,
  },
  prepItemPickerTextSelected: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
  },
  prepItemPickerTextPlaceholder: {
    fontSize: 15,
    color: '#9ca3af',
  },
  qtyInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    marginBottom: 12,
  },
  qtyInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
  },
  unitLabel: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '600',
    marginLeft: 8,
  },
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  pickerModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  pickerModalList: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  pickerItemSelected: {
    backgroundColor: '#eff6ff',
  },
  pickerItemContent: {
    flex: 1,
  },
  pickerItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  pickerItemUnit: {
    fontSize: 14,
    color: '#6b7280',
  },
  qtyLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  qtyOptionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  qtyOptionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  qtyOptionButtonSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  qtyOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  qtyOptionTextSelected: {
    color: '#2563eb',
  },
  prepItemDropdown: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    marginBottom: 12,
    maxHeight: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  prepItemDropdownScroll: {
    maxHeight: 200,
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  dropdownItemSelected: {
    backgroundColor: '#eff6ff',
  },
  dropdownItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  dropdownItemUnit: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
});