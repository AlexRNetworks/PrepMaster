import React, { useState } from 'react';
import PrepScheduleManager from '@/components/PrepScheduleManager';
import PrepDetailView from '@/components/PrepDetailView';
import { useUser } from '@/context/UserContext';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';

// --- Shared Types (duplicated minimally to avoid cross-file refactor) ---
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
  date: string;
  primaryPrepPerson: number;
  additionalWorkers: number[];
  tasks: PrepTask[];
  createdBy: number;
  createdAt: string;
}

type ScreenMode = 'manager' | 'detail';

export default function ExploreTab() {
  const { currentUser, allUsers } = useUser();
  const [mode, setMode] = useState<ScreenMode>('manager');
  const [selectedSchedule, setSelectedSchedule] = useState<PrepSchedule | null>(null);
  const [selectedScheduleDocId, setSelectedScheduleDocId] = useState<string | undefined>(undefined);

  // If no user is logged in, show a message
  if (!currentUser) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.message}>Please log in to view prep schedules.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (mode === 'manager') {
    return (
      <PrepScheduleManager
        currentUser={currentUser}
        allUsers={allUsers}
        onBack={() => {}} // No back needed - always on manager screen
        onViewSchedule={(schedule, docId) => {
          setSelectedSchedule(schedule);
          setSelectedScheduleDocId(docId);
          setMode('detail');
        }}
      />
    );
  }

  if (mode === 'detail' && selectedSchedule) {
    return (
      <PrepDetailView
        schedule={selectedSchedule}
        currentUser={currentUser}
        allUsers={allUsers}
        onBack={() => setMode('manager')}
        onUpdateSchedule={(updated) => setSelectedSchedule(updated)}
        scheduleDocId={selectedScheduleDocId}
      />
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  message: {
    fontSize: 18,
    color: '#6b7280',
    textAlign: 'center',
  },
});
