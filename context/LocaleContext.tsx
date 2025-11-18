import React, { createContext, useContext, useMemo, useState, ReactNode, useCallback } from 'react';

export type Locale = 'en' | 'es';

const strings = {
  en: {
    // Login Screen
    login: 'Login',
    enterPin: 'Enter your 4-digit PIN',
    createAccount: 'Create Account',
    signInAsGuest: 'Sign in as Guest',
    loadingUsers: 'Loading Users...',
    incorrectPin: 'Incorrect PIN',
    
    // Navigation & Tabs
    settings: 'Settings',
    analytics: 'Analytics',
    logs: 'Logs',
    recurring: 'Recurring',
    explore: 'Explore',
    
    // Dashboard
    dashboard: 'Dashboard',
    today: 'Today',
    schedule: 'Schedule',
    selectDate: 'Select Date',
    
    // Settings Page
    pushNotifications: 'Push Notifications',
    offlineStatus: 'Offline Mode',
    offline: 'Offline',
    online: 'Online',
    language: 'Language',
    theme: 'Theme',
    userManagement: 'User Management',
    
    // Analytics
    roleAnalytics: 'Role-Based Analytics',
    extraAnalyticsInfo: 'You have access to advanced analytics.',
    
    // Templates
    templates: 'Templates',
    noPrepSchedulesYet: 'No prep schedules yet',
    createTemplate: 'Create Template',
    selectTemplate: 'Select a template',
    templateName: 'Template Name',
    templateSaved: 'Template saved',
    
    // Recurring Schedules
    createRecurringRule: 'Create Recurring Rule',
    addAtLeastOneTask: 'Please add at least one task to the schedule.',
    enterTaskNameAndQty: 'Please enter task name and quantity.',
    primaryPrepPersonRequired: 'Primary Prep Person *',
    daysOfWeek: 'Days of Week',
    startDate: 'Start Date',
    endDateOptional: 'End Date (Optional)',
    generateDaysAhead: 'Generate days ahead',
    setupRecurring: 'Set up Recurring',
    recurringSaved: 'Recurring rule saved',
    
    // Tasks
    addTask: 'Add Task',
    notesOptional: 'Notes (Optional)',
    taskName: 'Task name',
    quantityLabel: 'Quantity',
    
    // Common Messages
    success: 'Success!',
    error: 'Error',
    accessDenied: 'Logs are only accessible to Managers and IT Admins.',
    accessDeniedTitle: 'Access Denied',
    accessDeniedText: 'This page is only accessible to Managers and IT Admins.',
    range7: 'Last 7 Days',
    range30: 'Last 30 Days',
    all: 'All Time',
    
    // Analytics Summary Cards
    totalSchedules: 'Total Schedules',
    totalTasks: 'Total Tasks',
    completionRate: 'Completion Rate',
    avgTimePerTask: 'Avg Time/Task',
    
    // Analytics Sections
    employeePerformance: 'Employee Performance',
    avgTaskCompletionTimes: 'Avg Task Completion Times',
    incompleteTaskTrends: 'Incomplete Task Trends',
    noPerformanceData: 'No performance data available',
    noTimingData: 'No timing data available',
    noIncompleteData: 'No incomplete task data available',
    completed: 'completed',
    incomplete: 'incomplete',
    completions: 'completions',
    task: 'task',
    // Forecasts/Insights
    prepInsights: 'Prep Insights',
    upcomingForecasts: 'Upcoming Forecasts (7 days)',
    recentPrepActivity: 'Recent Prep Activity',
    noRecentPrep: 'No recent prep logged.',
    generateNow: 'Generate Now',
    generating: 'Generating...',
    forecastsGenerated: 'Forecasts generated! Refresh in a few seconds.',
    failedGenerateForecasts: 'Failed to generate forecasts',
    sampleData: 'Sample',
    sampleDataGenerated: 'Sample prep logs generated!',
    // Forecasts
    suggestedPrep: 'Suggested Prep (history)',
    forecastEmpty: 'No forecast data yet for this date.',
    
    // Settings Screen
    manageAppPreferences: 'Manage app preferences and notifications',
    networkStatus: 'Network Status',
    sendTestNotification: 'Send Test Notification',
    cleanUpDailyDigest: 'Clean Up Daily Digest (Local)',
    pushToken: 'Push Token',
    showMyExpoPushToken: 'Show My Expo Push Token',
    showExpoProjectId: 'Show Expo Project ID',
    advancedAnalytics: 'You have access to advanced analytics and reports.',
    
    // Recurring Screen
    templates: 'Templates',
    createTemplate: 'Create Template',
    createRecurringRule: 'Create Recurring Rule',
    templateName: 'Template Name',
    addTask: 'Add Task',
    cancel: 'Cancel',
    setupRecurringSchedule: 'Setup Recurring Schedule',
    selectTemplate: 'Select Template',
    primaryPrepPerson: 'Primary Prep Person',
    additionalWorkers: 'Additional Workers (Optional)',
    high: 'HIGH',
    medium: 'MEDIUM',
    low: 'LOW',
    mon: 'Mon',
    tue: 'Tue',
    wed: 'Wed',
    thu: 'Thu',
    fri: 'Fri',
    sat: 'Sat',
    sun: 'Sun',
    
    // Common UI
    secureAccess: 'Secure access for authorized personnel',
    analyticsReports: 'Analytics & Reports',
    performanceInsights: 'Performance insights and metrics',
    clearPin: 'Clear PIN',
    loginSuccessful: 'Login Successful',
    welcome: 'Welcome',
    whereToGo: 'Where would you like to go?',
    authFailed: 'Authentication Failed',
    incorrectPinMessage: 'The PIN you entered is incorrect or the account is inactive.',
    confirmLogout: 'Confirm Logout',
    areYouSure: 'Are you sure you want to log out?',
    logout: 'Logout',
    
    // Employee Dashboard
    myTasks: 'My Tasks',
    todaysTasks: "Today's Tasks",
    upcomingTasks: 'Upcoming Tasks',
    allTasks: 'All Tasks',
    markComplete: 'Mark Complete',
    markIncomplete: 'Mark Incomplete',
    noTasksAssigned: 'No tasks assigned',
    viewDetails: 'View Details',
    taskDetails: 'Task Details',
    status: 'Status',
    priority: 'Priority',
    assignedTo: 'Assigned To',
    notes: 'Notes',
    close: 'Close',
    save: 'Save',
    edit: 'Edit',
    delete: 'Delete',
    
    // Prep Schedule Manager
    prepSchedules: 'Prep Schedules',
    createNewSchedule: 'Create New Schedule',
    scheduleForDate: 'Schedule for Date',
    primaryWorker: 'Primary Worker',
    additionalWorker: 'Additional Worker',
    addAdditionalWorker: 'Add Additional Worker',
    removeWorker: 'Remove Worker',
    addTaskToSchedule: 'Add Task to Schedule',
    createSchedule: 'Create Schedule',
    editSchedule: 'Edit Schedule',
    deleteSchedule: 'Delete Schedule',
    noSchedulesYet: 'No schedules yet',
    viewSchedule: 'View Schedule',
    back: 'Back',
    today: 'Today',
    
    // User Management
    userManagement: 'User Management',
    createUser: 'Create User',
    editUser: 'Edit User',
    deleteUser: 'Delete User',
    userName: 'User Name',
    userPin: 'User PIN',
    userRole: 'User Role',
    permissions: 'Permissions',
    active: 'Active',
    inactive: 'Inactive',
    role: 'Role',
    employee: 'Employee',
    manager: 'Manager',
    itAdmin: 'IT Admin',
    selectRole: 'Select Role',
    assignPermissions: 'Assign Permissions',
    managePermissions: 'Manage Permissions',
    noUsersYet: 'No users yet',
    
    // Permissions
    assignTasks: 'Assign Tasks',
    viewLogs: 'View Task Logs',
    editTasks: 'Edit Tasks',
    deleteTasks: 'Delete Tasks',
    manageUsers: 'Manage Users',
    viewAnalytics: 'View Analytics',
    systemSettings: 'System Settings',
    assignTasksDesc: 'Create and assign tasks to employees',
    viewLogsDesc: 'Access completed task history',
    editTasksDesc: 'Modify existing tasks',
    deleteTasksDesc: 'Remove tasks from the system',
    manageUsersDesc: 'Add, edit, or remove users (Manager+ only)',
    viewAnalyticsDesc: 'Access performance reports and analytics',
    managePermissionsDesc: 'Assign permissions to users (IT Admin only)',
    systemSettingsDesc: 'Configure app-wide settings (IT Admin only)',
    
    // Task statuses and priorities
    complete: 'Complete',
    pending: 'Pending',
    inProgress: 'In Progress',
    highPriority: 'High Priority',
    mediumPriority: 'Medium Priority',
    lowPriority: 'Low Priority',
    
    // Date and time
    date: 'Date',
    time: 'Time',
    duration: 'Duration',
    startDate: 'Start Date',
    endDate: 'End Date',
    
    // Actions
    submit: 'Submit',
    confirm: 'Confirm',
    remove: 'Remove',
    update: 'Update',
    view: 'View',
    filter: 'Filter',
    search: 'Search',
    sort: 'Sort',
    
    // Additional Dashboard & Task texts
    noTasksCompleted: 'No Tasks Completed',
    completeTasksFirst: "You haven't completed any tasks yet. Complete at least one task before signing off.",
    confirmSignOff: 'Confirm Sign Off',
    tasksLoggedSuccess: 'Your tasks have been logged successfully.',
    failedUpdateTask: 'Failed to update task',
    required: 'Required',
    provideIncompleteReason: 'Please provide a reason for marking this task incomplete.',
    taskMarkedIncomplete: 'Task marked as incomplete with reason.',
    done: 'Done',
    total: 'Total',
    allTasks: 'All Tasks',
    pendingTasks: 'Pending Tasks',
    completedTasks: 'Completed Tasks',
    noSchedulesAssigned: 'No prep schedules assigned to you yet',
    noCompletedTasks: 'No completed tasks yet',
    noPendingTasks: 'No pending tasks',
    viewAllSchedules: 'View All Schedules',
    signOffSubmit: 'Sign Off & Submit',
    markTaskIncomplete: 'Mark Task Incomplete',
    pleaseProvideReason: 'Please provide a reason:',
    enterReason: 'Enter reason...',
    
    // PrepScheduleManager
    confirmDelete: 'Confirm Delete',
    confirmDeleteSchedule: 'Are you sure you want to delete this prep schedule?',
    scheduleNotFound: 'Could not find schedule to delete.',
    deleted: 'Deleted',
    scheduleRemoved: 'Schedule has been removed.',
    failedDeleteSchedule: 'Failed to delete schedule',
    upcoming: 'Upcoming',
    noEmployees: 'No Employees',
    createFirstSchedule: 'Create your first prep schedule to get started',
    createdBy: 'Created by',
    
    // Profile Modal
    userInfo: 'User Info',
    name: 'Name',
    performance: 'Performance',
    tasksCompleted: 'Tasks Completed',
    tasksReverted: 'Tasks Reverted',
    topPreps: 'Top Preps',
    last7Days: 'Last 7 Days',
    noActivityThisWeek: 'No activity this week',
    detailedStats: 'Detailed Stats',
    totalActions: 'Total Actions',
    successfulCompletions: 'Successful Completions',
    revertedTasks: 'Reverted Tasks',
    thisWeekActivity: 'This Week Activity',
    actions: 'actions',
    averageTimes: 'Average Times',
    timeTrackingComingSoon: 'Time tracking coming soon',
    overview: 'Overview',
    weekly: 'Weekly',
    loadingStats: 'Loading stats...',
  },
  es: {
    // Login Screen
    login: 'Iniciar Sesión',
    enterPin: 'Ingrese su PIN de 4 dígitos',
    createAccount: 'Crear Cuenta',
    signInAsGuest: 'Entrar como Invitado',
    loadingUsers: 'Cargando Usuarios...',
    incorrectPin: 'PIN Incorrecto',
    
    // Navigation & Tabs
    settings: 'Configuración',
    analytics: 'Analítica',
    logs: 'Registros',
    recurring: 'Recurrente',
    explore: 'Explorar',
    
    // Dashboard
    dashboard: 'Panel',
    today: 'Hoy',
    schedule: 'Horario',
    selectDate: 'Seleccionar Fecha',
    
    // Settings Page
    pushNotifications: 'Notificaciones Push',
    offlineStatus: 'Modo sin conexión',
    offline: 'Sin conexión',
    online: 'Con conexión',
    language: 'Idioma',
    theme: 'Tema',
    userManagement: 'Gestión de Usuarios',
    
    // Analytics
    roleAnalytics: 'Analítica por Rol',
    extraAnalyticsInfo: 'Tienes acceso a analíticas avanzadas.',
    
    // Templates
    templates: 'Plantillas',
    noPrepSchedulesYet: 'Aún no hay horarios de preparación',
    createTemplate: 'Crear Plantilla',
    selectTemplate: 'Selecciona una plantilla',
    templateName: 'Nombre de la Plantilla',
    templateSaved: 'Plantilla guardada',
    
    // Recurring Schedules
    createRecurringRule: 'Crear Regla Recurrente',
    addAtLeastOneTask: 'Agrega al menos una tarea al horario.',
    enterTaskNameAndQty: 'Indica nombre y cantidad de la tarea.',
    primaryPrepPersonRequired: 'Persona Principal de Preparación *',
    daysOfWeek: 'Días de la Semana',
    startDate: 'Fecha de Inicio',
    endDateOptional: 'Fecha de Fin (Opcional)',
    generateDaysAhead: 'Generar días por adelantado',
    setupRecurring: 'Configurar Recurrencia',
    recurringSaved: 'Regla recurrente guardada',
    
    // Tasks
    addTask: 'Agregar Tarea',
    notesOptional: 'Notas (Opcional)',
    taskName: 'Nombre de la tarea',
    quantityLabel: 'Cantidad',
    
    // Common Messages
    success: '¡Éxito!',
    error: 'Error',
    accessDenied: 'Los registros solo están disponibles para Gerentes y Administradores de TI.',
    accessDeniedTitle: 'Acceso Denegado',
    accessDeniedText: 'Esta página solo está disponible para Gerentes y Administradores de TI.',
    range7: 'Últimos 7 Días',
    range30: 'Últimos 30 Días',
    all: 'Todo el tiempo',
    
    // Analytics Summary Cards
    totalSchedules: 'Horarios Totales',
    totalTasks: 'Tareas Totales',
    completionRate: 'Tasa de Finalización',
    avgTimePerTask: 'Tiempo Prom/Tarea',
    
    // Analytics Sections
    employeePerformance: 'Rendimiento de Empleados',
    avgTaskCompletionTimes: 'Tiempos Promedio de Finalización',
    incompleteTaskTrends: 'Tendencias de Tareas Incompletas',
    noPerformanceData: 'No hay datos de rendimiento disponibles',
    noTimingData: 'No hay datos de tiempo disponibles',
    noIncompleteData: 'No hay datos de tareas incompletas',
    completed: 'completadas',
    incomplete: 'incompletas',
    completions: 'finalizaciones',
    task: 'tarea',
    // Forecasts/Insights
    prepInsights: 'Ideas de Preparación',
    upcomingForecasts: 'Pronósticos Próximos (7 días)',
    recentPrepActivity: 'Actividad Reciente de Preparación',
    noRecentPrep: 'No hay preparación reciente registrada.',
    generateNow: 'Generar Ahora',
    generating: 'Generando...',
    forecastsGenerated: '¡Pronósticos generados! Actualiza en unos segundos.',
    failedGenerateForecasts: 'No se pudieron generar pronósticos',
    sampleData: 'Muestra',
    sampleDataGenerated: '¡Registros de preparación de muestra generados!',
    // Forecasts
    suggestedPrep: 'Preparación sugerida (historial)',
    forecastEmpty: 'Aún no hay datos de pronóstico para esta fecha.',
    
    // Settings Screen
    manageAppPreferences: 'Gestionar preferencias y notificaciones de la aplicación',
    networkStatus: 'Estado de Red',
    sendTestNotification: 'Enviar Notificación de Prueba',
    cleanUpDailyDigest: 'Limpiar Resumen Diario (Local)',
    pushToken: 'Token Push',
    showMyExpoPushToken: 'Mostrar Mi Token Push de Expo',
    showExpoProjectId: 'Mostrar ID de Proyecto Expo',
    advancedAnalytics: 'Tienes acceso a analíticas y reportes avanzados.',
    
    // Recurring Screen
    templates: 'Plantillas',
    createTemplate: 'Crear Plantilla',
    createRecurringRule: 'Crear Regla Recurrente',
    templateName: 'Nombre de la Plantilla',
    addTask: 'Agregar Tarea',
    cancel: 'Cancelar',
    setupRecurringSchedule: 'Configurar Horario Recurrente',
    selectTemplate: 'Seleccionar Plantilla',
    primaryPrepPerson: 'Persona Principal de Preparación',
    additionalWorkers: 'Trabajadores Adicionales (Opcional)',
    high: 'ALTA',
    medium: 'MEDIA',
    low: 'BAJA',
    mon: 'Lun',
    tue: 'Mar',
    wed: 'Mié',
    thu: 'Jue',
    fri: 'Vie',
    sat: 'Sáb',
    sun: 'Dom',
    
    // Common UI
    secureAccess: 'Acceso seguro para personal autorizado',
    analyticsReports: 'Analítica e Informes',
    performanceInsights: 'Perspectivas de rendimiento y métricas',
    clearPin: 'Borrar PIN',
    loginSuccessful: 'Inicio de Sesión Exitoso',
    welcome: 'Bienvenido',
    whereToGo: '¿A dónde te gustaría ir?',
    authFailed: 'Autenticación Fallida',
    incorrectPinMessage: 'El PIN que ingresaste es incorrecto o la cuenta está inactiva.',
    confirmLogout: 'Confirmar Cierre de Sesión',
    areYouSure: '¿Estás seguro de que deseas cerrar sesión?',
    logout: 'Cerrar Sesión',
    
    // Employee Dashboard
    myTasks: 'Mis Tareas',
    todaysTasks: 'Tareas de Hoy',
    upcomingTasks: 'Próximas Tareas',
    allTasks: 'Todas las Tareas',
    markComplete: 'Marcar Completa',
    markIncomplete: 'Marcar Incompleta',
    noTasksAssigned: 'No hay tareas asignadas',
    viewDetails: 'Ver Detalles',
    taskDetails: 'Detalles de Tarea',
    status: 'Estado',
    priority: 'Prioridad',
    assignedTo: 'Asignado a',
    notes: 'Notas',
    close: 'Cerrar',
    save: 'Guardar',
    edit: 'Editar',
    delete: 'Eliminar',
    
    // Prep Schedule Manager
    prepSchedules: 'Horarios de Preparación',
    createNewSchedule: 'Crear Nuevo Horario',
    scheduleForDate: 'Horario para Fecha',
    primaryWorker: 'Trabajador Principal',
    additionalWorker: 'Trabajador Adicional',
    addAdditionalWorker: 'Agregar Trabajador Adicional',
    removeWorker: 'Quitar Trabajador',
    addTaskToSchedule: 'Agregar Tarea al Horario',
    createSchedule: 'Crear Horario',
    editSchedule: 'Editar Horario',
    deleteSchedule: 'Eliminar Horario',
    noSchedulesYet: 'Aún no hay horarios',
    viewSchedule: 'Ver Horario',
    back: 'Atrás',
    today: 'Hoy',
    
    // User Management
    userManagement: 'Gestión de Usuarios',
    createUser: 'Crear Usuario',
    editUser: 'Editar Usuario',
    deleteUser: 'Eliminar Usuario',
    userName: 'Nombre de Usuario',
    userPin: 'PIN de Usuario',
    userRole: 'Rol de Usuario',
    permissions: 'Permisos',
    active: 'Activo',
    inactive: 'Inactivo',
    role: 'Rol',
    employee: 'Empleado',
    manager: 'Gerente',
    itAdmin: 'Admin de TI',
    selectRole: 'Seleccionar Rol',
    assignPermissions: 'Asignar Permisos',
    managePermissions: 'Gestionar Permisos',
    noUsersYet: 'Aún no hay usuarios',
    
    // Permissions
    assignTasks: 'Asignar Tareas',
    viewLogs: 'Ver Registros de Tareas',
    editTasks: 'Editar Tareas',
    deleteTasks: 'Eliminar Tareas',
    manageUsers: 'Gestionar Usuarios',
    viewAnalytics: 'Ver Analítica',
    systemSettings: 'Configuración del Sistema',
    assignTasksDesc: 'Crear y asignar tareas a empleados',
    viewLogsDesc: 'Acceder al historial de tareas completadas',
    editTasksDesc: 'Modificar tareas existentes',
    deleteTasksDesc: 'Eliminar tareas del sistema',
    manageUsersDesc: 'Agregar, editar o eliminar usuarios (Gerente+)',
    viewAnalyticsDesc: 'Acceder a reportes de rendimiento y analítica',
    managePermissionsDesc: 'Asignar permisos a usuarios (Solo Admin de TI)',
    systemSettingsDesc: 'Configurar ajustes de toda la aplicación (Solo Admin de TI)',
    
    // Task statuses and priorities
    complete: 'Completa',
    pending: 'Pendiente',
    inProgress: 'En Progreso',
    highPriority: 'Prioridad Alta',
    mediumPriority: 'Prioridad Media',
    lowPriority: 'Prioridad Baja',
    
    // Date and time
    date: 'Fecha',
    time: 'Hora',
    duration: 'Duración',
    startDate: 'Fecha de Inicio',
    endDate: 'Fecha de Fin',
    
    // Actions
    submit: 'Enviar',
    confirm: 'Confirmar',
    remove: 'Quitar',
    update: 'Actualizar',
    view: 'Ver',
    filter: 'Filtrar',
    search: 'Buscar',
    sort: 'Ordenar',
    
    // Additional Dashboard & Task texts
    noTasksCompleted: 'No Hay Tareas Completadas',
    completeTasksFirst: 'Aún no has completado ninguna tarea. Completa al menos una tarea antes de finalizar.',
    confirmSignOff: 'Confirmar Finalización',
    tasksLoggedSuccess: 'Tus tareas han sido registradas exitosamente.',
    failedUpdateTask: 'Error al actualizar la tarea',
    required: 'Requerido',
    provideIncompleteReason: 'Por favor proporciona una razón para marcar esta tarea como incompleta.',
    taskMarkedIncomplete: 'Tarea marcada como incompleta con razón.',
    done: 'Hecho',
    total: 'Total',
    allTasks: 'Todas las Tareas',
    pendingTasks: 'Tareas Pendientes',
    completedTasks: 'Tareas Completadas',
    noSchedulesAssigned: 'Aún no tienes horarios de preparación asignados',
    noCompletedTasks: 'Aún no hay tareas completadas',
    noPendingTasks: 'No hay tareas pendientes',
    viewAllSchedules: 'Ver Todos los Horarios',
    signOffSubmit: 'Finalizar y Enviar',
    markTaskIncomplete: 'Marcar Tarea Incompleta',
    pleaseProvideReason: 'Por favor proporciona una razón:',
    enterReason: 'Ingresa la razón...',
    
    // PrepScheduleManager
    confirmDelete: 'Confirmar Eliminación',
    confirmDeleteSchedule: '¿Estás seguro de que deseas eliminar este horario de preparación?',
    scheduleNotFound: 'No se pudo encontrar el horario para eliminar.',
    deleted: 'Eliminado',
    scheduleRemoved: 'El horario ha sido eliminado.',
    failedDeleteSchedule: 'Error al eliminar horario',
    upcoming: 'Próximos',
    noEmployees: 'Sin Empleados',
    createFirstSchedule: 'Crea tu primer horario de preparación para comenzar',
    createdBy: 'Creado por',
    
    // Profile Modal
    userInfo: 'Información del Usuario',
    name: 'Nombre',
    performance: 'Rendimiento',
    tasksCompleted: 'Tareas Completadas',
    tasksReverted: 'Tareas Revertidas',
    topPreps: 'Mejores Preparaciones',
    last7Days: 'Últimos 7 Días',
    noActivityThisWeek: 'Sin actividad esta semana',
    detailedStats: 'Estadísticas Detalladas',
    totalActions: 'Acciones Totales',
    successfulCompletions: 'Finalizaciones Exitosas',
    revertedTasks: 'Tareas Revertidas',
    thisWeekActivity: 'Actividad de Esta Semana',
    actions: 'acciones',
    averageTimes: 'Tiempos Promedio',
    timeTrackingComingSoon: 'Seguimiento de tiempo próximamente',
    overview: 'Resumen',
    weekly: 'Semanal',
    loadingStats: 'Cargando estadísticas...',
  },
};

interface LocaleContextType { locale: Locale; toggleLocale: () => void; t: (key: keyof typeof strings['en']) => string }

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en');
  const t = useCallback((key: keyof typeof strings['en']) => {
    const group = strings[locale];
    return (group as any)[key] ?? (strings['en'] as any)[key] ?? key;
  }, [locale]);
  const toggleLocale = useCallback(() => setLocale(prev => (prev === 'en' ? 'es' : 'en')), []);
  const value = useMemo(() => ({ locale, toggleLocale, t }), [locale, toggleLocale, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
