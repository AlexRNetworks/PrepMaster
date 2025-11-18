import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert, Image } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useUser } from '@/context/UserContext';
import { useLocale } from '@/context/LocaleContext';
import { collection, addDoc, onSnapshot, orderBy, query, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type Priority = 'high' | 'medium' | 'low';

// --- PREDEFINED PREP ITEMS ---
const PREP_ITEMS = [
  { name: 'Pancetta', unit: 'trays', qtyOptions: ['1', '2', '3', '4'] },
  { name: 'Roasted Veggies', unit: 'trays', qtyOptions: ['1', '2', '3', '4'] },
  { name: 'Sliced Potatoes', unit: 'trays', qtyOptions: ['1', '2', '3', '4'] },
  { name: 'Parm Potatoes', unit: 'trays', qtyOptions: ['1', '2', '3', '4'] },
  { name: '9oz Dough', unit: 'trays', qtyOptions: ['1', '2', '3', '4'] },
  { name: '6oz Dough', unit: 'trays', qtyOptions: ['1', '2', '3', '4'] },
  { name: 'Mushrooms', unit: 'half trays', qtyOptions: ['1', '2', '3', '4'] },
  { name: 'Slow Cooked Onions', unit: 'qt', qtyOptions: ['4', '8'] },
  { name: 'Black Olives', unit: 'qt', qtyOptions: ['4', '8'] },
  { name: 'Roasted Pepper Soup', unit: 'qt', qtyOptions: ['4', '8'] },
  { name: 'Red Onions', unit: 'qt', qtyOptions: ['4', '8'] },
  { name: 'Prosciutto', unit: 'qt', qtyOptions: ['4', '8'] },
  { name: 'Artichokes', unit: 'qt', qtyOptions: ['4', '8'] },
  { name: 'Peppadews', unit: 'qt', qtyOptions: ['4', '8'] },
];

interface TemplateTask { name: string; qty: string; priority: Priority; notes?: string }
interface ScheduleTemplate { id: string; name: string; tasks: TemplateTask[]; createdBy: number; createdAt: string }
interface RecurringRule { id: string; active: boolean; templateId: string; daysOfWeek: number[]; assign: { primaryPrepPerson: number; additionalWorkers: number[] }; startDate: string; endDate?: string; generateDaysAhead?: number; createdBy: number; createdAt: string }

export default function RecurringScreen() {
  const { currentUser, allUsers } = useUser();
  const { t } = useLocale();

  // Access control - only Managers and IT_Admin can manage recurring schedules
  if (!currentUser || (currentUser.role !== 'Manager' && currentUser.role !== 'IT_Admin')) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <Image
            source={{ uri: 'https://i.ibb.co/7tmLxCNZ/Purple-Minimalist-People-Profile-Logo-1.png' }}
            style={styles.logo}
          />
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

  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [rules, setRules] = useState<RecurringRule[]>([]);

  const [tplModal, setTplModal] = useState(false);
  const [tplName, setTplName] = useState('');
  const [taskName, setTaskName] = useState('');
  const [taskQty, setTaskQty] = useState('');
  const [taskPriority, setTaskPriority] = useState<Priority>('medium');
  const [taskNotes, setTaskNotes] = useState('');
  const [tplTasks, setTplTasks] = useState<TemplateTask[]>([]);
  const [showTplItemPicker, setShowTplItemPicker] = useState(false);
  const [selectedTplItem, setSelectedTplItem] = useState<{ name: string; unit: string; qtyOptions: string[] } | null>(null);

  const [recModal, setRecModal] = useState(false);
  const [selTplId, setSelTplId] = useState<string | null>(null);
  const employees = useMemo(() => allUsers.filter(u => u.active && (u.role === 'Employee' || u.role === 'Manager')), [allUsers]);
  const [recPrimary, setRecPrimary] = useState<number | null>(null);
  const [recAdditional, setRecAdditional] = useState<number[]>([]);
  const [recDays, setRecDays] = useState<number[]>([]);
  const [recStart, setRecStart] = useState(new Date().toISOString().split('T')[0]);
  const [recEnd, setRecEnd] = useState('');
  const [recAhead, setRecAhead] = useState<number>(7);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  useEffect(() => {
    const unsubTpl = onSnapshot(query(collection(db, 'scheduleTemplates'), orderBy('name','asc') as any), snap => {
      const next: ScheduleTemplate[] = [];
      snap.forEach(ds => {
        const d: any = ds.data();
        next.push({ id: ds.id, name: d.name, tasks: d.tasks || [], createdBy: d.createdBy || 0, createdAt: d.createdAt || new Date().toISOString() });
      });
      setTemplates(next);
    }, () => {});

    const unsubRec = onSnapshot(query(collection(db, 'recurringSchedules'), orderBy('createdAt','desc') as any), snap => {
      const next: RecurringRule[] = [];
      snap.forEach(ds => { const d: any = ds.data(); next.push({ id: ds.id, ...d }); });
      setRules(next);
    }, () => {});
    return () => { unsubTpl(); unsubRec(); };
  }, []);

  const addTaskToTemplate = () => {
    if (!selectedTplItem || !taskQty) { Alert.alert('Error', 'Please select a prep item and quantity'); return; }
    setTplTasks(prev => [...prev, { name: selectedTplItem.name, qty: `${taskQty} ${selectedTplItem.unit}`, priority: taskPriority, notes: taskNotes.trim() }]);
    setSelectedTplItem(null); setTaskQty(''); setTaskNotes(''); setTaskPriority('medium');
  };

  const saveTemplate = async () => {
    if (!tplName.trim()) { Alert.alert('Error', 'Please enter template name'); return; }
    if (tplTasks.length === 0) { Alert.alert('Error', 'Add at least one task'); return; }
    try {
      await addDoc(collection(db, 'scheduleTemplates'), { name: tplName.trim(), tasks: tplTasks, createdBy: currentUser?.id || 0, createdAt: serverTimestamp() });
      setTplModal(false); setTplName(''); setTplTasks([]);
      Alert.alert('Success', 'Template saved successfully');
    } catch (e: any) { Alert.alert('Error', e?.message || 'Failed to save template'); }
  };

  const removeTemplate = async (id: string) => { try { await deleteDoc(doc(db, 'scheduleTemplates', id)); } catch {} };
  const toggleDay = (d: number) => setRecDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  const deleteRule = async (id: string) => {
    Alert.alert(
      'Delete Recurring Schedule',
      'Are you sure you want to delete this recurring schedule?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'recurringSchedules', id));
              Alert.alert('Success', 'Recurring schedule deleted');
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Failed to delete');
            }
          }
        }
      ]
    );
  };

  const toggleRuleActive = async (rule: RecurringRule) => {
    try {
      const { updateDoc } = await import('firebase/firestore');
      await updateDoc(doc(db, 'recurringSchedules', rule.id), { active: !rule.active });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update');
    }
  };

  const editRule = (rule: RecurringRule) => {
    setEditingRuleId(rule.id);
    setSelTplId(rule.templateId);
    setRecPrimary(rule.assign?.primaryPrepPerson || null);
    setRecAdditional(rule.assign?.additionalWorkers || []);
    setRecDays(rule.daysOfWeek);
    setRecStart(rule.startDate);
    setRecEnd(rule.endDate || '');
    setRecAhead(rule.generateDaysAhead || 7);
    setRecModal(true);
  };

  const createRule = async () => {
    if (!selTplId) { Alert.alert('Error', 'Please select a template'); return; }
    if (!recPrimary) { Alert.alert('Error', 'Primary prep person is required'); return; }
    if (recDays.length === 0) { Alert.alert('Error', 'Please select days of week'); return; }
    const start = recStart || new Date().toISOString().split('T')[0];
    try {
      const ruleData = {
        active: true, templateId: selTplId, daysOfWeek: recDays.sort(), assign: { primaryPrepPerson: recPrimary, additionalWorkers: recAdditional },
        startDate: start, endDate: recEnd || null, generateDaysAhead: recAhead, timezone: 'America/Los_Angeles', createdBy: currentUser?.id || 0,
      };
      
      if (editingRuleId) {
        // Update existing rule
        const { updateDoc } = await import('firebase/firestore');
        await updateDoc(doc(db, 'recurringSchedules', editingRuleId), ruleData);
        Alert.alert('Success', 'Recurring schedule updated');
      } else {
        // Create new rule
        await addDoc(collection(db, 'recurringSchedules'), { ...ruleData, createdAt: serverTimestamp() });
        Alert.alert('Success', 'Recurring schedule created');
      }
      
      setRecModal(false); setSelTplId(null); setRecPrimary(null); setRecAdditional([]); setRecDays([]); setRecStart(new Date().toISOString().split('T')[0]); setRecEnd(''); setRecAhead(7); setEditingRuleId(null);
      Alert.alert('Success', 'Recurring rule created successfully');
    } catch (e: any) { Alert.alert('Error', e?.message || 'Failed to save recurring rule'); }
  };

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Image source={{ uri: 'https://i.ibb.co/7tmLxCNZ/Purple-Minimalist-People-Profile-Logo-1.png' }} style={styles.logo} />
      </View>

      <View style={styles.content}>
        <Text style={styles.pageTitle}>{t('recurring')}</Text>
        <Text style={styles.pageSubtitle}>Manage templates and recurring rules</Text>

        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionHeader}>{t('templates')}</Text>
          <View style={styles.card}>
            {templates.length === 0 ? (
              <Text style={styles.emptyText}>{t('noPrepSchedulesYet')}</Text>
            ) : templates.map(tpl => (
              <View key={tpl.id} style={styles.row}>
                <Text style={styles.rowText}>{tpl.name}</Text>
                <TouchableOpacity onPress={() => removeTemplate(tpl.id)} style={styles.btnSm}>
                  <Text style={styles.btnSmText}>Delete</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity onPress={() => setTplModal(true)} style={styles.btn}>
              <Text style={styles.btnText}>+ {t('createTemplate')}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionHeader}>{t('recurring')}</Text>
          <View style={styles.card}>
            {rules.length === 0 ? (
              <Text style={styles.emptyText}>No rules yet</Text>
            ) : rules.map(rule => {
              const template = templates.find(t => t.id === rule.templateId);
              const primaryWorker = allUsers.find(u => u.id === rule.assign?.primaryPrepPerson);
              const additionalWorkers = rule.assign?.additionalWorkers?.map(id => allUsers.find(u => u.id === id)?.name).filter(Boolean) || [];
              
              return (
                <View key={rule.id} style={styles.ruleCard}>
                  <View style={styles.ruleHeader}>
                    <Text style={styles.ruleTitle}>{template?.name || 'Template'}</Text>
                    <TouchableOpacity 
                      style={[styles.statusBadge, rule.active ? styles.statusActive : styles.statusInactive]}
                      onPress={() => toggleRuleActive(rule)}
                    >
                      <Text style={[styles.statusText, !rule.active && { color: '#991b1b' }]}>
                        {rule.active ? 'Active' : 'Inactive'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  
                  <View style={styles.ruleDetail}>
                    <Text style={styles.ruleLabel}>Days:</Text>
                    <Text style={styles.ruleValue}>{rule.daysOfWeek.map(d => days[d]).join(', ')}</Text>
                  </View>
                  
                  <View style={styles.ruleDetail}>
                    <Text style={styles.ruleLabel}>Primary:</Text>
                    <Text style={styles.ruleValue}>{primaryWorker?.name || 'Not assigned'}</Text>
                  </View>
                  
                  {additionalWorkers.length > 0 && (
                    <View style={styles.ruleDetail}>
                      <Text style={styles.ruleLabel}>Additional:</Text>
                      <Text style={styles.ruleValue}>{additionalWorkers.join(', ')}</Text>
                    </View>
                  )}
                  
                  <View style={styles.ruleDetail}>
                    <Text style={styles.ruleLabel}>Dates:</Text>
                    <Text style={styles.ruleValue}>
                      {new Date(rule.startDate).toLocaleDateString()} - {rule.endDate ? new Date(rule.endDate).toLocaleDateString() : 'Ongoing'}
                    </Text>
                  </View>
                  
                  {/* Action Buttons */}
                  <View style={styles.ruleActions}>
                    <TouchableOpacity 
                      style={[styles.ruleActionBtn, styles.ruleActionEdit]}
                      onPress={() => editRule(rule)}
                    >
                      <Text style={styles.ruleActionText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.ruleActionBtn, styles.ruleActionDelete]}
                      onPress={() => deleteRule(rule.id)}
                    >
                      <Text style={styles.ruleActionText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
            <TouchableOpacity onPress={() => setRecModal(true)} style={[styles.btn, styles.btnSuccess]}>
              <Text style={styles.btnText}>+ {t('createRecurringRule')}</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>

      <Modal visible={tplModal} animationType="slide" transparent onRequestClose={() => setTplModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{t('createTemplate')}</Text>
            <TextInput style={styles.input} value={tplName} onChangeText={setTplName} placeholder={t('templateName')} />
            
            {/* Prep Item Picker */}
            <TouchableOpacity
              style={styles.prepItemPickerButton}
              onPress={() => setShowTplItemPicker(!showTplItemPicker)}
            >
              <Text style={selectedTplItem ? styles.prepItemPickerTextSelected : styles.prepItemPickerTextPlaceholder}>
                {selectedTplItem ? selectedTplItem.name : t('selectPrepItem') || 'Select Prep Item'}
              </Text>
              <Text style={{ fontSize: 16 }}>{showTplItemPicker ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            
            {/* Inline Dropdown */}
            {showTplItemPicker && (
              <View style={styles.prepItemDropdown}>
                <ScrollView style={styles.prepItemDropdownScroll} nestedScrollEnabled>
                  {PREP_ITEMS.map((item, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[styles.dropdownItem, selectedTplItem?.name === item.name && styles.dropdownItemSelected]}
                      onPress={() => {
                        setSelectedTplItem(item);
                        setTaskQty('');
                        setShowTplItemPicker(false);
                      }}
                    >
                      <View>
                        <Text style={styles.dropdownItemName}>{item.name}</Text>
                        <Text style={styles.dropdownItemUnit}>{item.unit}</Text>
                      </View>
                      {selectedTplItem?.name === item.name && <Text style={{ color: '#2563eb', fontSize: 18 }}>✓</Text>}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
            
            {/* Quantity Picker Buttons */}
            {selectedTplItem && (
              <View>
                <Text style={styles.qtyLabel}>{t('selectQuantity') || 'Select Quantity'}</Text>
                <View style={styles.qtyOptionsRow}>
                  {selectedTplItem.qtyOptions.map((qty) => (
                    <TouchableOpacity
                      key={qty}
                      style={[styles.qtyOptionButton, taskQty === qty && styles.qtyOptionButtonSelected]}
                      onPress={() => setTaskQty(qty)}
                    >
                      <Text style={[styles.qtyOptionText, taskQty === qty && styles.qtyOptionTextSelected]}>
                        {qty} {selectedTplItem.unit}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {(['high','medium','low'] as Priority[]).map(p => (
                <TouchableOpacity key={p} onPress={() => setTaskPriority(p)} style={[styles.chip, taskPriority===p && styles.chipActive]}>
                  <Text style={[styles.chipText, taskPriority===p && styles.chipTextActive]}>{t(p)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} value={taskNotes} onChangeText={setTaskNotes} placeholder={t('notesOptional')} />
            <TouchableOpacity onPress={addTaskToTemplate} style={[styles.btn, styles.btnSuccess]}>
              <Text style={styles.btnText}>+ {t('addTask')}</Text>
            </TouchableOpacity>
            {tplTasks.map((t, i) => (
              <View key={i} style={styles.taskItem}><Text style={styles.taskItemText}>{t.name} • {t.qty} • {t.priority.toUpperCase()}</Text></View>
            ))}
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setTplModal(false)} style={[styles.btn, styles.btnCancel, { flex: 1 }]}><Text style={styles.btnText}>{t('cancel')}</Text></TouchableOpacity>
              <TouchableOpacity onPress={saveTemplate} style={[styles.btn, { flex: 1 }]}><Text style={styles.btnText}>{t('createTemplate')}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={recModal} animationType="slide" transparent onRequestClose={() => setRecModal(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>{editingRuleId ? 'Edit Recurring Schedule' : t('setupRecurringSchedule')}</Text>
              <Text style={styles.modalSectionTitle}>{t('selectTemplate')}</Text>
              <View style={{ gap: 8, marginBottom: 12 }}>
                {templates.map(tpl => (
                  <TouchableOpacity key={tpl.id} style={[styles.chip, selTplId === tpl.id && styles.chipActive]} onPress={() => setSelTplId(tpl.id)}>
                    <Text style={[styles.chipText, selTplId === tpl.id && styles.chipTextActive]}>{tpl.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.modalSectionTitle}>{t('primaryPrepPerson')}</Text>
              <View style={{ gap: 8, marginBottom: 12 }}>
                {employees.map(e => (
                  <TouchableOpacity key={e.id} style={[styles.chip, recPrimary===e.id && styles.chipActive]} onPress={() => setRecPrimary(e.id)}>
                    <Text style={[styles.chipText, recPrimary===e.id && styles.chipTextActive]}>{e.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.modalSectionTitle}>{t('additionalWorkers')}</Text>
              <View style={{ gap: 8, marginBottom: 12 }}>
                {employees.filter(e => e.id !== recPrimary).map(e => (
                  <TouchableOpacity key={e.id} style={[styles.chip, recAdditional.includes(e.id) && styles.chipActive]} onPress={() => setRecAdditional(prev => prev.includes(e.id) ? prev.filter(x => x!==e.id) : [...prev, e.id])}>
                    <Text style={[styles.chipText, recAdditional.includes(e.id) && styles.chipTextActive]}>{e.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.modalSectionTitle}>{t('daysOfWeek')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {[0,1,2,3,4,5,6].map(d => (
                  <TouchableOpacity key={d} style={[styles.chip, recDays.includes(d) && styles.chipActive]} onPress={() => setRecDays(prev => prev.includes(d) ? prev.filter(x => x!==d) : [...prev, d])}>
                    <Text style={[styles.chipText, recDays.includes(d) && styles.chipTextActive]}>{[t('sun'),t('mon'),t('tue'),t('wed'),t('thu'),t('fri'),t('sat')][d]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.modalSectionTitle}>{t('startDate')}</Text>
              <TouchableOpacity
                style={styles.datePickerButton}
                onPress={() => setShowStartPicker(true)}
              >
                <IconSymbol name="calendar" size={20} color="#2563eb" />
                <Text style={styles.datePickerButtonText}>
                  {recStart ? new Date(recStart).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : t('selectStartDate') || 'Select Start Date'}
                </Text>
              </TouchableOpacity>
              
              <Modal
                visible={showStartPicker}
                transparent
                animationType="fade"
                onRequestClose={() => setShowStartPicker(false)}
              >
                <View style={styles.calendarModalOverlay}>
                  <View style={styles.calendarModalContent}>
                    <Text style={styles.calendarModalTitle}>{t('selectStartDate') || 'Select Start Date'}</Text>
                    <Calendar
                      current={recStart || new Date().toISOString().split('T')[0]}
                      onDayPress={(day) => {
                        setRecStart(day.dateString);
                        setShowStartPicker(false);
                      }}
                      markedDates={{
                        [recStart]: { selected: true, selectedColor: '#2563eb' }
                      }}
                      theme={{
                        todayTextColor: '#2563eb',
                        selectedDayBackgroundColor: '#2563eb',
                        selectedDayTextColor: '#ffffff',
                        arrowColor: '#2563eb',
                      }}
                    />
                    <TouchableOpacity
                      style={[styles.calendarModalButton, styles.calendarModalButtonCancel]}
                      onPress={() => setShowStartPicker(false)}
                    >
                      <Text style={styles.calendarModalButtonTextCancel}>{t('cancel') || 'Cancel'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>
              <Text style={styles.modalSectionTitle}>{t('endDateOptional')}</Text>
              <TouchableOpacity
                style={styles.datePickerButton}
                onPress={() => setShowEndPicker(true)}
              >
                <IconSymbol name="calendar" size={20} color="#2563eb" />
                <Text style={styles.datePickerButtonText}>
                  {recEnd ? new Date(recEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : t('selectEndDate') || 'Select End Date (Optional)'}
                </Text>
                {recEnd && (
                  <TouchableOpacity onPress={() => setRecEnd('')} style={{ marginLeft: 'auto' }}>
                    <IconSymbol name="xmark.circle.fill" size={20} color="#6b7280" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
              
              <Modal
                visible={showEndPicker}
                transparent
                animationType="fade"
                onRequestClose={() => setShowEndPicker(false)}
              >
                <View style={styles.calendarModalOverlay}>
                  <View style={styles.calendarModalContent}>
                    <Text style={styles.calendarModalTitle}>{t('selectEndDate') || 'Select End Date (Optional)'}</Text>
                    <Calendar
                      current={recEnd || recStart || new Date().toISOString().split('T')[0]}
                      minDate={recStart}
                      onDayPress={(day) => {
                        setRecEnd(day.dateString);
                        setShowEndPicker(false);
                      }}
                      markedDates={{
                        [recEnd]: { selected: true, selectedColor: '#2563eb' }
                      }}
                      theme={{
                        todayTextColor: '#2563eb',
                        selectedDayBackgroundColor: '#2563eb',
                        selectedDayTextColor: '#ffffff',
                        arrowColor: '#2563eb',
                      }}
                    />
                    <TouchableOpacity
                      style={[styles.calendarModalButton, styles.calendarModalButtonCancel]}
                      onPress={() => setShowEndPicker(false)}
                    >
                      <Text style={styles.calendarModalButtonTextCancel}>{t('cancel') || 'Cancel'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>
              <Text style={styles.modalSectionTitle}>{t('generateDaysAhead')}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                {[3,7,14,21,28].map(n => (
                  <TouchableOpacity key={n} style={[styles.chip, recAhead===n && styles.chipActive]} onPress={() => setRecAhead(n)}>
                    <Text style={[styles.chipText, recAhead===n && styles.chipTextActive]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity onPress={() => setRecModal(false)} style={[styles.btn, styles.btnCancel, { flex: 1 }]}><Text style={styles.btnText}>{t('cancel')}</Text></TouchableOpacity>
                <TouchableOpacity onPress={createRule} style={[styles.btn, styles.btnSuccess, { flex: 1 }]}><Text style={styles.btnText}>{t('setupRecurring')}</Text></TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
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
  scrollContent: { flex: 1 },
  sectionHeader: { fontSize: 18, fontWeight: '600', marginBottom: 12, marginTop: 8, color: '#111827' },
  card: { borderRadius: 12, padding: 16, backgroundColor: '#f9fafb', marginBottom: 16 },
  emptyText: { color: '#6b7280', fontSize: 14, fontStyle: 'italic', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  rowText: { fontSize: 14, fontWeight: '500', color: '#111827', flex: 1 },
  btn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', backgroundColor: '#2563eb', marginTop: 12 },
  btnSuccess: { backgroundColor: '#10b981' },
  btnCancel: { backgroundColor: '#6b7280' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  btnSm: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, alignItems: 'center', backgroundColor: '#ef4444' },
  btnSmText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center' },
  modal: { borderRadius: 12, padding: 20, backgroundColor: '#ffffff', margin: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 16, color: '#111827' },
  modalSectionTitle: { fontSize: 14, fontWeight: '600', marginBottom: 8, color: '#111827' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12, backgroundColor: '#ffffff', color: '#111827' },
  inputRow: { flexDirection: 'row', gap: 8 },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#f3f4f6', alignSelf: 'flex-start' },
  chipActive: { backgroundColor: '#2563eb' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  chipTextActive: { color: '#ffffff' },
  taskItem: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#f9fafb', borderRadius: 8, marginTop: 8 },
  taskItemText: { fontSize: 13, color: '#111827', fontWeight: '500' },
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
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
    marginBottom: 16,
  },
  datePickerButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    flex: 1,
  },
  calendarModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    width: '85%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  calendarModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
    textAlign: 'center',
  },
  calendarModalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  calendarModalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  calendarModalButtonCancel: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  calendarModalButtonSave: {
    backgroundColor: '#2563eb',
  },
  calendarModalButtonTextCancel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  calendarModalButtonTextSave: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
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
  prepItemDropdown: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    marginBottom: 12,
    maxHeight: 200,
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
    flexWrap: 'wrap',
  },
  qtyOptionButton: {
    flex: 1,
    minWidth: 80,
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
  ruleCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  ruleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  ruleTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
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
    color: '#065f46',
  },
  ruleDetail: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  ruleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    width: 80,
  },
  ruleValue: {
    fontSize: 14,
    color: '#111827',
    flex: 1,
  },
  ruleActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  ruleActionBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  ruleActionEdit: {
    backgroundColor: '#3b82f6',
  },
  ruleActionDelete: {
    backgroundColor: '#ef4444',
  },
  ruleActionText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
