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
} from 'react-native';
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
          await addDoc(collection(db, 'users'), { ...newUser, createdAt: serverTimestamp() });
          Alert.alert('Success', 'User added successfully!');
        }
        setModalVisible(false);
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
      case 'IT_Admin': return '⚡';
      case 'Manager': return '👔';
      case 'Employee': return '👤';
    }
  };

  if (!canManageUsers) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerText}>User Management</Text>
        </View>
        <View style={styles.accessDenied}>
          <Text style={styles.accessDeniedEmoji}>🔒</Text>
          <Text style={styles.accessDeniedText}>Access Denied</Text>
          <Text style={styles.accessDeniedSubtext}>
            You dont have permission to manage users.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerText}>User Management</Text>
        <Text style={styles.subHeaderText}>
          Logged in as: {currentUser.name} ({currentUser.role})
        </Text>
      </View>

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
                <Text style={styles.userIcon}>{getRoleIcon(user.role)}</Text>
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
                <Text style={styles.actionButtonText}>🔐 Permissions</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleEditUser(user)}
              >
                <Text style={styles.actionButtonText}>✏️ Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.deleteButton]}
                onPress={() => handleDeleteUser(user.id)}
              >
                <Text style={[styles.actionButtonText, styles.deleteButtonText]}>
                  🗑️ Delete
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

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
                    <Text
                      style={[
                        styles.roleOptionText,
                        formRole === role && styles.roleOptionTextSelected,
                      ]}
                    >
                      {getRoleIcon(role)} {role}
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
  userList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  userCard: {
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
  userIcon: {
    fontSize: 40,
    marginRight: 12,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 4,
  },
  userMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roleBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  roleBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  userPin: {
    fontSize: 12,
    color: '#7f8c8d',
    fontWeight: '600',
  },
  permissionsPreview: {
    marginBottom: 12,
  },
  permissionsLabel: {
    fontSize: 12,
    color: '#7f8c8d',
    fontWeight: '600',
    marginBottom: 6,
  },
  permissionTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  permissionTag: {
    backgroundColor: '#ecf0f1',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  permissionTagText: {
    fontSize: 11,
    color: '#34495e',
    fontWeight: '600',
  },
  userActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#3498db',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  deleteButton: {
    backgroundColor: '#ffebee',
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
    maxHeight: '80%',
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
  roleSelector: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  roleOption: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  roleOptionSelected: {
    borderColor: '#3498db',
    backgroundColor: '#e3f2fd',
  },
  roleOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7f8c8d',
  },
  roleOptionTextSelected: {
    color: '#3498db',
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
    borderBottomColor: '#ecf0f1',
  },
  permissionInfo: {
    flex: 1,
    marginRight: 12,
  },
  permissionName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 2,
  },
  permissionDescription: {
    fontSize: 12,
    color: '#7f8c8d',
  },
  restrictedLabel: {
    fontSize: 10,
    color: '#e74c3c',
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


export default UserManagement;