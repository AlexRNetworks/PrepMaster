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
  Switch,
  Image,
} from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useLocale } from '@/context/LocaleContext';
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
  updateDoc,
} from 'firebase/firestore';

// --- TYPES & INTERFACES ---
type UserRole = 'IT_Admin' | 'Manager' | 'Employee';

interface Permission {
  id: string;
  name: string;
  description: string;
}

interface User {
  id: number;
  name: string;
  pin: string;
  role: UserRole;
  permissions: string[];
  active: boolean;
  createdAt: string;
}

interface UserManagementProps {
  currentUser: User;
  onBack: () => void;
}

// --- PERMISSIONS CATALOG ---
const ALL_PERMISSIONS: Permission[] = [
  { id: 'assign_tasks', name: 'Assign Tasks', description: 'Create and assign tasks to employees' },
  { id: 'view_logs', name: 'View Task Logs', description: 'Access completed task history' },
  { id: 'edit_tasks', name: 'Edit Tasks', description: 'Modify existing tasks' },
  { id: 'delete_tasks', name: 'Delete Tasks', description: 'Remove tasks from the system' },
  { id: 'manage_users', name: 'Manage Users', description: 'Add, edit, or remove users (Manager+ only)' },
  { id: 'view_analytics', name: 'View Analytics', description: 'Access performance reports and analytics' },
  { id: 'manage_permissions', name: 'Manage Permissions', description: 'Assign permissions to users (IT Admin only)' },
  { id: 'system_settings', name: 'System Settings', description: 'Configure app-wide settings (IT Admin only)' },
];

// --- DEFAULT PERMISSION SETS ---
const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, string[]> = {
  IT_Admin: ALL_PERMISSIONS.map(p => p.id),
  Manager: ['assign_tasks', 'view_logs', 'edit_tasks', 'delete_tasks', 'manage_users', 'view_analytics'],
  Employee: [],
};

// Firestore-backed users list is subscribed in the component

// --- MAIN COMPONENT ---
function UserManagement({ currentUser, onBack }: UserManagementProps) {
  const { t } = useLocale();
  const [users, setUsers] = useState<User[]>([]);
  const [userDocIds, setUserDocIds] = useState<Record<number, string>>({});
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [permissionModalVisible, setPermissionModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formPin, setFormPin] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('Employee');

  // Subscribe to Firestore users collection
  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('id', 'asc'));
    const unsub = onSnapshot(q, snap => {
      const next: User[] = [];
      const idMap: Record<number, string> = {};
      snap.forEach(ds => {
        const data = ds.data() as any;
        if (typeof data?.id !== 'number') return;
        next.push({
          id: data.id,
          name: data.name,
          pin: data.pin,
          role: data.role,
          permissions: data.permissions || [],
          active: data.active ?? true,
          createdAt: data.createdAt || new Date().toISOString(),
        });
        idMap[data.id] = ds.id;
      });
      setUsers(next);
      setUserDocIds(idMap);
    });
    return () => unsub();
  }, []);

  const nextUserId = useMemo(() => (users.length ? Math.max(...users.map(u => u.id)) + 1 : 1), [users]);

  if (!currentUser) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: 'red', fontSize: 18 }}>Error: No user data provided.</Text>
      </View>
    );
  }

  const canManageUsers = currentUser.permissions.includes('manage_users');
  const canManagePermissions = currentUser.permissions.includes('manage_permissions');
  const isITAdmin = currentUser.role === 'IT_Admin';

  // --- HANDLERS ---
  const handleAddUser = () => {
    setEditingUser(null);
    setFormName('');
    setFormPin('');
    setFormRole('Employee');
    setModalVisible(true);
  };

  const handleEditUser = (user: User) => {
    if (user.role === 'IT_Admin' && !isITAdmin) {
      Alert.alert('Access Denied', 'Only IT Admins can edit IT Admin accounts.');
      return;
    }
    setEditingUser(user);
    setFormName(user.name);
    setFormPin(user.pin);
    setFormRole(user.role);
    setModalVisible(true);
  };

  const handleSaveUser = () => {
    if (!formName.trim()) {
      Alert.alert('Error', 'Please enter a name.');
      return;
    }
    if (formPin.length !== 4) {
      Alert.alert('Error', 'PIN must be exactly 4 digits.');
      return;
    }

    (async () => {
      try {
        if (editingUser) {
          const docId = userDocIds[editingUser.id];
          if (!docId) throw new Error('Could not find user to update.');
          await updateDoc(doc(db, 'users', docId), {
            name: formName,
            pin: formPin,
            role: formRole,
            permissions: ROLE_DEFAULT_PERMISSIONS[formRole],
          });
          Alert.alert('Success', 'User updated successfully!');
        } else {
          const newUser: User = {
            id: nextUserId,
            name: formName,
            pin: formPin,
            role: formRole,
            permissions: ROLE_DEFAULT_PERMISSIONS[formRole],
            active: true,
            createdAt: new Date().toISOString(),
          };
          console.log('Creating new user:', newUser);
          await addDoc(collection(db, 'users'), { ...newUser, createdAt: serverTimestamp() });
          Alert.alert('Success', 'User added successfully!');
        }
        setModalVisible(false);
        setFormName('');
        setFormPin('');
        setFormRole('Employee');
        setEditingUser(null);
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Failed to save user');
      }
    })();
  };

  const handleToggleActive = (userId: number) => {
    const user = users.find(u => u.id === userId);
    if (user?.role === 'IT_Admin' && !isITAdmin) {
      Alert.alert('Access Denied', 'Only IT Admins can deactivate IT Admin accounts.');
      return;
    }

    (async () => {
      try {
        const docId = userDocIds[userId];
        if (!docId) throw new Error('Could not find user to toggle.');
        const current = users.find(u => u.id === userId);
        await updateDoc(doc(db, 'users', docId), { active: !current?.active });
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Failed to update user');
      }
    })();
  };

  const handleDeleteUser = (userId: number) => {
    const user = users.find(u => u.id === userId);
    if (user?.role === 'IT_Admin' && !isITAdmin) {
      Alert.alert('Access Denied', 'Only IT Admins can delete IT Admin accounts.');
      return;
    }

    Alert.alert(
      'Confirm Delete',
      `Are you sure you want to delete ${user?.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            (async () => {
              try {
                const docId = userDocIds[userId];
                if (!docId) throw new Error('Could not find user to delete.');
                await deleteDoc(doc(db, 'users', docId));
                Alert.alert('Deleted', 'User has been removed.');
              } catch (e: any) {
                Alert.alert('Error', e?.message || 'Failed to delete user');
              }
            })();
          },
        },
      ]
    );
  };

  const handleManagePermissions = (user: User) => {
    if (!canManagePermissions) {
      Alert.alert('Access Denied', 'You do not have permission to manage permissions.');
      return;
    }
    if (user.role === 'IT_Admin' && !isITAdmin) {
      Alert.alert('Access Denied', 'Only IT Admins can modify IT Admin permissions.');
      return;
    }
    setSelectedUser(user);
    setPermissionModalVisible(true);
  };

  const handleTogglePermission = (permissionId: string) => {
    if (!selectedUser) return;

    const updatedPermissions = selectedUser.permissions.includes(permissionId)
      ? selectedUser.permissions.filter(p => p !== permissionId)
      : [...selectedUser.permissions, permissionId];

    setSelectedUser({ ...selectedUser, permissions: updatedPermissions });
  };

  const handleSavePermissions = () => {
    if (!selectedUser) return;

    (async () => {
      try {
        const docId = userDocIds[selectedUser.id];
        if (!docId) throw new Error('Could not find user to update.');
        await updateDoc(doc(db, 'users', docId), { permissions: selectedUser.permissions });
        Alert.alert('Success', 'Permissions updated successfully!');
        setPermissionModalVisible(false);
        setSelectedUser(null);
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Failed to update permissions');
      }
    })();
  };

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case 'IT_Admin': return '#e74c3c';
      case 'Manager': return '#3498db';
      case 'Employee': return '#95a5a6';
    }
  };

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case 'IT_Admin': return 'bolt.fill';
      case 'Manager': return 'briefcase.fill';
      case 'Employee': return 'person.fill';
    }
  };

  const getRoleDisplayName = (role: UserRole) => {
    switch (role) {
      case 'IT_Admin': return 'IT Admin';
      case 'Manager': return 'Manager';
      case 'Employee': return 'Employee';
    }
  };

  if (!canManageUsers) {
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
        <View style={styles.accessDenied}>
          <IconSymbol name="lock.fill" size={64} color="#ef4444" />
          <Text style={styles.accessDeniedTitle}>Access Denied</Text>
          <Text style={styles.accessDeniedText}>
            You don&apos;t have permission to manage users.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

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
        <Text style={styles.pageTitle}>User Management</Text>
        <Text style={styles.pageSubtitle}>Manage users, roles, and permissions</Text>

        <View style={styles.statsCard}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{users.length}</Text>
          <Text style={styles.statLabel}>Total Users</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{users.filter(u => u.active).length}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{users.filter(u => u.role === 'Manager').length}</Text>
          <Text style={styles.statLabel}>Managers</Text>
        </View>
        </View>

        <ScrollView style={styles.userList} showsVerticalScrollIndicator={false}>
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>All Users</Text>
            <TouchableOpacity style={styles.addButton} onPress={handleAddUser}>
              <Text style={styles.addButtonText}>+ Add User</Text>
            </TouchableOpacity>
          </View>

          {users.map(user => (
          <View
            key={user.id}
            style={[styles.userCard, !user.active && styles.userCardInactive]}
          >
            <View style={styles.userCardHeader}>
              <View style={styles.userInfo}>
                <View style={styles.userIconContainer}>
                  <IconSymbol name={getRoleIcon(user.role)} size={24} color="#ffffff" />
                </View>
                <View>
                  <Text style={styles.userName}>{user.name}</Text>
                  <View style={styles.userMeta}>
                    <View
                      style={[
                        styles.roleBadge,
                        { backgroundColor: getRoleBadgeColor(user.role) },
                      ]}
                    >
                      <Text style={styles.roleBadgeText}>{user.role}</Text>
                    </View>
                    <Text style={styles.userPin}>PIN: {user.pin}</Text>
                  </View>
                </View>
              </View>
              <Switch
                value={user.active}
                onValueChange={() => handleToggleActive(user.id)}
                trackColor={{ false: '#e0e0e0', true: '#2ecc71' }}
                thumbColor={user.active ? '#ffffff' : '#f4f3f4'}
              />
            </View>

            <View style={styles.permissionsPreview}>
              <Text style={styles.permissionsLabel}>
                Permissions: {user.permissions.length}
              </Text>
              <View style={styles.permissionTags}>
                {user.permissions.slice(0, 3).map(permId => {
                  const perm = ALL_PERMISSIONS.find(p => p.id === permId);
                  return perm ? (
                    <View key={permId} style={styles.permissionTag}>
                      <Text style={styles.permissionTagText}>{perm.name}</Text>
                    </View>
                  ) : null;
                })}
                {user.permissions.length > 3 && (
                  <View style={styles.permissionTag}>
                    <Text style={styles.permissionTagText}>
                      +{user.permissions.length - 3} more
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.userActions}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleManagePermissions(user)}
              >
                <IconSymbol name="lock.fill" size={14} color="#ffffff" style={{ marginRight: 4 }} />
                <Text style={styles.actionButtonText}>Permissions</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleEditUser(user)}
              >
                <IconSymbol name="pencil" size={14} color="#ffffff" style={{ marginRight: 4 }} />
                <Text style={styles.actionButtonText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.deleteButton]}
                onPress={() => handleDeleteUser(user.id)}
              >
                <IconSymbol name="trash" size={14} color="#ef4444" style={{ marginRight: 4 }} />
                <Text style={[styles.actionButtonText, styles.deleteButtonText]}>
                  Delete
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
        </ScrollView>
      </View>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingUser ? 'Edit User' : 'Add New User'}
            </Text>

            <Text style={styles.inputLabel}>Name</Text>
            <TextInput
              style={styles.input}
              value={formName}
              onChangeText={setFormName}
              placeholder="Enter full name"
            />

            <Text style={styles.inputLabel}>PIN (4 digits)</Text>
            <TextInput
              style={styles.input}
              value={formPin}
              onChangeText={(text) => setFormPin(text.replace(/[^0-9]/g, '').slice(0, 4))}
              placeholder="0000"
              keyboardType="number-pad"
              maxLength={4}
            />

            <Text style={styles.inputLabel}>Role</Text>
            <View style={styles.roleSelector}>
              {(['Employee', 'Manager', ...(isITAdmin ? ['IT_Admin'] : [])] as UserRole[]).map(
                role => (
                  <TouchableOpacity
                    key={role}
                    style={[
                      styles.roleOption,
                      formRole === role && styles.roleOptionSelected,
                    ]}
                    onPress={() => setFormRole(role)}
                  >
                    <IconSymbol 
                      name={getRoleIcon(role)} 
                      size={18} 
                      color={formRole === role ? '#2563eb' : '#6b7280'} 
                    />
                    <Text
                      style={[
                        styles.roleOptionText,
                        formRole === role && styles.roleOptionTextSelected,
                      ]}
                    >
                      {getRoleDisplayName(role)}
                    </Text>
                  </TouchableOpacity>
                )
              )}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSaveUser}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={permissionModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setPermissionModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Manage Permissions: {selectedUser?.name}
            </Text>
            <Text style={styles.modalSubtitle}>
              Role: {selectedUser?.role}
            </Text>

            <ScrollView style={styles.permissionsList}>
              {ALL_PERMISSIONS.map(permission => {
                const isRestricted =
                  (permission.id === 'manage_permissions' ||
                    permission.id === 'system_settings') &&
                  !isITAdmin;

                return (
                  <View key={permission.id} style={styles.permissionItem}>
                    <View style={styles.permissionInfo}>
                      <Text style={styles.permissionName}>{permission.name}</Text>
                      <Text style={styles.permissionDescription}>
                        {permission.description}
                      </Text>
                      {isRestricted && (
                        <Text style={styles.restrictedLabel}>IT Admin Only</Text>
                      )}
                    </View>
                    <Switch
                      value={selectedUser?.permissions.includes(permission.id)}
                      onValueChange={() => handleTogglePermission(permission.id)}
                      disabled={isRestricted}
                      trackColor={{ false: '#e0e0e0', true: '#3498db' }}
                      thumbColor={
                        selectedUser?.permissions.includes(permission.id)
                          ? '#ffffff'
                          : '#f4f3f4'
                      }
                    />
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setPermissionModalVisible(false);
                  setSelectedUser(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSavePermissions}
              >
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// --- STYLES ---
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
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#2563eb',
    fontWeight: '500',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginTop: 8,
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
    marginBottom: 20,
  },
  statsCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  addButton: {
    backgroundColor: '#10b981',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  userList: {
    flex: 1,
  },
  userCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  userCardInactive: {
    opacity: 0.6,
  },
  userCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  userIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  userEmail: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  userMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  userPin: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  permissionsPreview: {
    marginTop: 12,
  },
  permissionsLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
    marginBottom: 6,
  },
  permissionTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  permissionTag: {
    backgroundColor: '#f9fafb',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  permissionTagText: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '600',
  },
  userActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  deleteButton: {
    backgroundColor: 'transparent',
  },
  deleteButtonText: {
    color: '#ef4444',
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
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 0,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9fafb',
  },
  roleSelector: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  roleOption: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#f3f4f6',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  roleOptionSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  roleOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  roleOptionTextSelected: {
    color: '#2563eb',
  },
  permissionsList: {
    maxHeight: 400,
  },
  permissionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  permissionInfo: {
    flex: 1,
    marginRight: 12,
  },
  permissionName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  permissionDescription: {
    fontSize: 12,
    color: '#6b7280',
  },
  restrictedLabel: {
    fontSize: 10,
    color: '#ef4444',
    fontWeight: '700',
    marginTop: 4,
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
    backgroundColor: '#f3f4f6',
  },
  cancelButtonText: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '700',
  },
  saveButton: {
    backgroundColor: '#2563eb',
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
  accessDeniedTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginTop: 20,
  },
  accessDeniedText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
  },
});


export default UserManagement;