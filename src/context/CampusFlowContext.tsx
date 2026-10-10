import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type {
  User,
  Resource,
  Classroom,
  Notification,
  ResourceRequest,
  ClassroomAnnouncement,
  ResourceReport,
  ResourceReportStatus,
  ModerationLogEntry,
} from '../types';
import {
  currentUser as mockUser,
  resources as mockResources,
  classrooms as mockClassrooms,
  resourceRequests as mockResourceRequests,
  notifications as mockNotifications,
} from '../data/mockData';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import {
  createAdminVerificationNotification,
  deleteNotification,
  fetchNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  notificationRowToNotification,
} from '../lib/notifications';
import { createResourceReport, fetchMyReports } from '../lib/reports';
import type { ProfileRow } from '../types/database';

interface CampusFlowContextProps {
  currentUser: User;
  setCurrentUser: (user: User) => void;
  updateCurrentUser: (changes: Partial<Omit<User, 'id' | 'role'>>) => Promise<void>;
  users: User[];
  isAuthenticated: boolean;
  authLoading: boolean;
  sessionBlocked: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  registerUser: (input: RegisterUserInput) => Promise<{ success: boolean; message?: string; authenticated?: boolean }>;
  refreshProfile: () => Promise<User | null>;
  hasRole: (...roles: User['role'][]) => boolean;
  resources: Resource[];
  setResources: (resources: Resource[]) => void;
  classrooms: Classroom[];
  setClassrooms: React.Dispatch<React.SetStateAction<Classroom[]>>;
  classroomAnnouncements: ClassroomAnnouncement[];
  setClassroomAnnouncements: React.Dispatch<React.SetStateAction<ClassroomAnnouncement[]>>;
  resourceRequests: ResourceRequest[];
  setResourceRequests: (requests: ResourceRequest[]) => void;
  notifications: Notification[];
  setNotifications: (notifs: Notification[]) => void;
  notificationLoading: boolean;
  notificationError: string;
  // Helper actions
  addResource: (resource: Resource) => void;
  removeResource: (resourceId: string) => void;
  updateResource: (resourceId: string, changes: Partial<Resource>) => void;
  toggleFavorite: (resourceId: string) => void;
  addNotification: (notif: Notification) => void;
  markNotifRead: (id: string) => void;
  markAllNotifsRead: () => void;
  deleteNotif: (id: string) => void;
  reports: ResourceReport[];
  addReport: (report: Omit<ResourceReport, 'id' | 'createdAt' | 'status' | 'reporterId' | 'reporterName' | 'resourceTitle'>) => Promise<{ success: boolean; message?: string }>;
  updateReportStatus: (id: string, status: ResourceReportStatus) => void;
  moderationLogs: ModerationLogEntry[];
  addModerationLog: (entry: Omit<ModerationLogEntry, 'id' | 'adminId' | 'adminName' | 'createdAt'>) => void;
  disableUser: (userId: string) => boolean;
  enableUser: (userId: string) => boolean;
}

export interface RegisterUserInput {
  name: string;
  email: string;
  role: 'student' | 'teacher';
  department: string;
  semester?: number;
  designation?: string;
  password: string;
}

const demoUsers: User[] = [
  { ...mockUser, id: 'demo-student', email: 'student@campusflow.demo', name: 'CampusFlow Student', role: 'student' },
  { ...mockUser, id: 'demo-teacher', email: 'teacher@campusflow.demo', name: 'CampusFlow Teacher', role: 'teacher', designation: 'Professor' },
  { ...mockUser, id: 'demo-admin', email: 'admin@campusflow.demo', name: 'CampusFlow Admin', role: 'admin', designation: 'Administrator' },
];

function readLocal<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch { return fallback; }
}

function mapProfile(profile: ProfileRow): User {
  const name = profile.name || profile.email.split('@')[0] || 'CampusFlow User';
  return {
    id: profile.id,
    name,
    email: profile.email,
    role: profile.role,
    department: profile.department ?? '',
    semester: profile.semester ?? undefined,
    designation: profile.teaching_designation ?? undefined,
    bio: profile.bio ?? '',
    uploads: 0,
    downloads: 0,
    avatarInitials: name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
    joinedAt: new Date(profile.created_at).toLocaleDateString(),
    accountStatus: profile.account_status,
  };
}

const CampusFlowContext = createContext<CampusFlowContextProps | undefined>(undefined);

export const CampusFlowProvider = ({ children }: { children: ReactNode }) => {
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [accountStatuses, setAccountStatuses] = useState<Record<string, 'active' | 'disabled'>>(() => readLocal('campusflow_userStatuses', {}));
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [sessionBlocked, setSessionBlocked] = useState(false);
  const currentUser = sessionUser ?? mockUser;
  const users = [...demoUsers, ...(sessionUser && !demoUsers.some((user) => user.id === sessionUser.id) ? [sessionUser] : [])]
    .map((user) => ({ ...user, accountStatus: accountStatuses[user.id] ?? user.accountStatus ?? 'active' }));

  const [resources, setResources] = useState<Resource[]>(() => {
    return readLocal('campusflow_resources', mockResources);
  });

  const [classrooms, setClassrooms] = useState<Classroom[]>(() => {
    return readLocal('campusflow_classrooms', mockClassrooms);
  });
  const [classroomAnnouncements, setClassroomAnnouncements] = useState<ClassroomAnnouncement[]>(() => readLocal('campusflow_classroomAnnouncements', []));

  const [resourceRequests, setResourceRequests] = useState<ResourceRequest[]>(() => {
    return readLocal('campusflow_resourceRequests', mockResourceRequests);
  });

  const [allNotifications, setLocalNotifications] = useState<Notification[]>(() => (
    isSupabaseConfigured ? [] : readLocal('campusflow_notifications', mockNotifications)
  ));
  const [remoteNotifications, setRemoteNotifications] = useState<Notification[]>([]);
  const [notificationLoading, setNotificationLoading] = useState(isSupabaseConfigured);
  const [notificationError, setNotificationError] = useState('');
  const notifications = isSupabaseConfigured
    ? remoteNotifications
    : allNotifications.filter((notification) => !notification.userId || notification.userId === sessionUser?.id);
  const [reports, setReports] = useState<ResourceReport[]>(() => isSupabaseConfigured ? [] : readLocal('campusflow_reports', []));
  const [moderationLogs, setModerationLogs] = useState<ModerationLogEntry[]>(() => readLocal('campusflow_moderationLogs', []));

  // This status map still backs the local Phase 6 moderation prototype only.
  useEffect(() => { localStorage.setItem('campusflow_userStatuses', JSON.stringify(accountStatuses)); }, [accountStatuses]);
  useEffect(() => { if (!isSupabaseConfigured) localStorage.setItem('campusflow_reports', JSON.stringify(reports)); }, [reports]);
  useEffect(() => { localStorage.setItem('campusflow_moderationLogs', JSON.stringify(moderationLogs)); }, [moderationLogs]);
  useEffect(() => {
    const syncStatuses = (event: StorageEvent) => {
      if (event.key !== 'campusflow_userStatuses') return;
      try { setAccountStatuses(event.newValue ? JSON.parse(event.newValue) as Record<string, 'active' | 'disabled'> : {}); }
      catch { setAccountStatuses({}); }
    };
    window.addEventListener('storage', syncStatuses);
    return () => window.removeEventListener('storage', syncStatuses);
  }, []);
  useEffect(() => {
    // Remove credentials/session snapshots from the pre-Supabase local auth implementation.
    localStorage.removeItem('campusflow_session');
    localStorage.removeItem('campusflow_currentUser');
    localStorage.removeItem('campusflow_localAccounts');
  }, []);

  const applySession = async (session: Session | null): Promise<User | null> => {
    if (!session?.user || !supabase) {
      setSessionUser(null);
      setIsAuthenticated(false);
      setAuthLoading(false);
      return null;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle();

    if (error || !data) {
      setSessionUser(null);
      setIsAuthenticated(false);
      setAuthLoading(false);
      void supabase.auth.signOut();
      return null;
    }

    const profile = mapProfile(data);
    if (profile.accountStatus === 'disabled') {
      setSessionBlocked(true);
      setSessionUser(null);
      setIsAuthenticated(false);
      setAuthLoading(false);
      void supabase.auth.signOut();
      return null;
    }

    setSessionBlocked(false);
    setSessionUser(profile);
    setIsAuthenticated(true);
    setAuthLoading(false);
    return profile;
  };

  const refreshProfile = async (): Promise<User | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return applySession(data.session);
  };

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setAuthLoading(false);
      return;
    }

    let active = true;
    const restore = async () => {
      const { data, error } = await client.auth.getSession();
      if (!active) return;
      if (error) {
        setAuthLoading(false);
        return;
      }
      try {
        await applySession(data.session);
      } catch {
        setSessionUser(null);
        setIsAuthenticated(false);
        setAuthLoading(false);
      }
    };
    void restore();

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      // Defer Supabase calls until its auth callback releases the internal lock.
      window.setTimeout(() => {
        if (active) void applySession(session).catch(() => {
          setSessionUser(null);
          setIsAuthenticated(false);
          setAuthLoading(false);
        });
      }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('campusflow_resources', JSON.stringify(resources));
  }, [resources]);

  useEffect(() => {
    localStorage.setItem('campusflow_classrooms', JSON.stringify(classrooms));
  }, [classrooms]);
  useEffect(() => { localStorage.setItem('campusflow_classroomAnnouncements', JSON.stringify(classroomAnnouncements)); }, [classroomAnnouncements]);

  useEffect(() => {
    localStorage.setItem('campusflow_resourceRequests', JSON.stringify(resourceRequests));
  }, [resourceRequests]);

  useEffect(() => {
    if (!isSupabaseConfigured) localStorage.setItem('campusflow_notifications', JSON.stringify(allNotifications));
  }, [allNotifications]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || authLoading) return;
    if (!isAuthenticated || !sessionUser) {
      setRemoteNotifications([]);
      setNotificationError('Sign in to view notifications.');
      setNotificationLoading(false);
      return;
    }

    let active = true;
    const client = supabase;
    const refresh = async () => {
      try {
        const rows = await fetchNotifications();
        if (!active) return;
        setRemoteNotifications(rows.map(notificationRowToNotification));
        setNotificationError('');
      } catch (error) {
        if (active) setNotificationError(error instanceof Error ? error.message : 'Could not load notifications.');
      } finally {
        if (active) setNotificationLoading(false);
      }
    };

    setNotificationLoading(true);
    void refresh();
    const channel = client.channel(`notifications:${sessionUser.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${sessionUser.id}`,
      }, () => { void refresh(); })
      .subscribe((status) => {
        if (active && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
          setNotificationError('Live notification updates are unavailable. Refresh to check for new notifications.');
        }
      });

    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [authLoading, isAuthenticated, sessionUser?.id]);

  useEffect(() => {
    if (!isSupabaseConfigured || authLoading) return;
    if (!isAuthenticated || !sessionUser) {
      setReports([]);
      return;
    }
    let active = true;
    setReports([]);
    void fetchMyReports().then((nextReports) => {
      if (active) setReports(nextReports);
    }).catch((error: unknown) => {
      if (active) console.error('Could not load your resource reports:', error);
    });
    return () => { active = false; };
  }, [authLoading, isAuthenticated, sessionUser?.id]);

  // Helper functions
  const addResource = (resource: Resource) => {
    setResources((prev) => [...prev, resource]);
    if (resource.classroomId) setClassrooms((previous) => previous.map((classroom) => classroom.id === resource.classroomId ? { ...classroom, resources: classroom.resources + 1 } : classroom));
  };

  const removeResource = (resourceId: string) => {
    const resource = resources.find((item) => item.id === resourceId);
    if (resource) setClassrooms((previous) => previous.map((classroom) => {
      const linked = classroom.id === resource.classroomId || classroom.sharedResourceIds?.includes(resourceId);
      return {
        ...classroom,
        resources: linked ? Math.max(0, classroom.resources - 1) : classroom.resources,
        sharedResourceIds: (classroom.sharedResourceIds ?? []).filter((id) => id !== resourceId),
      };
    }));
    setResources((prev) => prev.filter((resource) => resource.id !== resourceId));
  };

  const updateResource = (resourceId: string, changes: Partial<Resource>) => {
    setResources((prev) => prev.map((resource) => resource.id === resourceId ? { ...resource, ...changes } : resource));
  };

  const toggleFavorite = (resourceId: string) => {
    setResources((prev) =>
      prev.map((r) => (r.id === resourceId ? { ...r, isFavorited: !r.isFavorited } : r))
    );
  };

  const setNotifications = (notifs: Notification[]) => {
    if (isSupabaseConfigured) setRemoteNotifications(notifs);
    else setLocalNotifications(notifs);
  };

  const addNotification = (notif: Notification) => {
    if (!isSupabaseConfigured) {
      setLocalNotifications((prev) => prev.some((existing) => existing.id === notif.id) ? prev : [...prev, notif]);
      return;
    }
    // Existing admin moderation actions notify another account. The RPC restricts this to active admins and
    // the existing verification category; other server-backed event notifications come from SQL triggers.
    if (currentUser.role !== 'admin' || notif.type !== 'verification' || !notif.userId) return;
    void createAdminVerificationNotification(notif).then((row) => {
      setRemoteNotifications((previous) => previous.some((item) => item.id === row.id)
        ? previous : [notificationRowToNotification(row), ...previous]);
      setNotificationError('');
    }).catch((error: unknown) => {
      setNotificationError(error instanceof Error ? error.message : 'Could not create notification.');
    });
  };

  const addReport: CampusFlowContextProps['addReport'] = async (input) => {
    if (!isAuthenticated || currentUser.role === 'admin') return { success: false, message: 'Sign in with a student or teacher account to report a resource.' };
    if (reports.some((report) => report.resourceId === input.resourceId && report.reporterId === currentUser.id)) {
      return { success: false, message: 'You have already reported this resource.' };
    }
    if (isSupabaseConfigured) {
      try {
        const report = await createResourceReport(input);
        setReports((previous) => [report, ...previous.filter((item) => item.id !== report.id)]);
        return { success: true };
      } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : 'The report could not be submitted.' };
      }
    }
    const resource = resources.find((item) => item.id === input.resourceId);
    if (!resource) return { success: false, message: 'This resource could not be found.' };
    const report: ResourceReport = {
      ...input, id: `report-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`, resourceTitle: resource.title,
      reporterId: currentUser.id, reporterName: currentUser.name, createdAt: new Date().toLocaleString(), status: 'open',
    };
    setReports((previous) => [report, ...previous]);
    return { success: true };
  };

  const updateReportStatus = (id: string, status: ResourceReportStatus) => {
    if (!isAuthenticated || currentUser.role !== 'admin') return;
    setReports((previous) => previous.map((report) => report.id === id ? { ...report, status } : report));
  };

  const addModerationLog: CampusFlowContextProps['addModerationLog'] = (entry) => {
    if (!isAuthenticated || currentUser.role !== 'admin') return;
    setModerationLogs((previous) => [{ ...entry, id: `audit-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`, adminId: currentUser.id, adminName: currentUser.name, createdAt: new Date().toLocaleString() }, ...previous]);
  };

  const setUserStatus = (userId: string, status: 'active' | 'disabled') => {
    if (!isAuthenticated || currentUser.role !== 'admin' || userId === currentUser.id) return false;
    const target = users.find((user) => user.id === userId);
    if (!target || target.role === 'admin') return false;
    setAccountStatuses((previous) => ({ ...previous, [userId]: status }));
    return true;
  };
  const disableUser = (userId: string) => setUserStatus(userId, 'disabled');
  const enableUser = (userId: string) => setUserStatus(userId, 'active');

  const markNotifRead = (id: string) => {
    if (!isSupabaseConfigured) {
      setLocalNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      return;
    }
    const previous = remoteNotifications;
    setRemoteNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    void markNotificationAsRead(id).then((row) => {
      if (!row) throw new Error('Notification not found or no longer available.');
      setNotificationError('');
    }).catch((error: unknown) => {
      const previousReadState = previous.find((notification) => notification.id === id)?.read;
      setRemoteNotifications((current) => current.map((notification) => notification.id === id
        ? { ...notification, read: previousReadState ?? false } : notification));
      setNotificationError(error instanceof Error ? error.message : 'Could not mark notification as read.');
    });
  };

  const markAllNotifsRead = () => {
    if (!isSupabaseConfigured) {
      setLocalNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      return;
    }
    const previous = remoteNotifications;
    setRemoteNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    void markAllNotificationsAsRead().then(() => setNotificationError('')).catch((error: unknown) => {
      const previousReadState = new Map(previous.map((notification) => [notification.id, notification.read]));
      setRemoteNotifications((current) => current.map((notification) => previousReadState.has(notification.id)
        ? { ...notification, read: previousReadState.get(notification.id) ?? notification.read } : notification));
      setNotificationError(error instanceof Error ? error.message : 'Could not mark notifications as read.');
    });
  };

  const deleteNotif = (id: string) => {
    if (!isSupabaseConfigured) {
      setLocalNotifications((prev) => prev.filter((n) => n.id !== id));
      return;
    }
    const previous = remoteNotifications;
    setRemoteNotifications((prev) => prev.filter((n) => n.id !== id));
    void deleteNotification(id).then(() => setNotificationError('')).catch((error: unknown) => {
      const index = previous.findIndex((notification) => notification.id === id);
      const removed = previous[index];
      if (removed) setRemoteNotifications((current) => {
        if (current.some((notification) => notification.id === id)) return current;
        const restored = [...current];
        restored.splice(Math.min(index, restored.length), 0, removed);
        return restored;
      });
      setNotificationError(error instanceof Error ? error.message : 'Could not delete notification.');
    });
  };

  const setCurrentUser = (user: User) => setSessionUser((previous) => previous ? { ...user, id: previous.id, role: previous.role, email: previous.email } : previous);
  const updateCurrentUser = async (changes: Partial<Omit<User, 'id' | 'role'>>) => {
    if (!sessionUser) return;

    const updated = { ...sessionUser, ...changes, id: sessionUser.id, role: sessionUser.role, email: sessionUser.email };
    const profileUpdate: Partial<Pick<ProfileRow, 'name' | 'department' | 'semester' | 'teaching_designation' | 'bio'>> = {};
    if (changes.name !== undefined) profileUpdate.name = changes.name.trim();
    if (changes.department !== undefined) profileUpdate.department = changes.department.trim();
    if (changes.semester !== undefined) profileUpdate.semester = changes.semester ?? null;
    if (changes.designation !== undefined) profileUpdate.teaching_designation = changes.designation ?? null;
    if (changes.bio !== undefined) profileUpdate.bio = changes.bio;

    if (Object.keys(profileUpdate).length > 0) {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { error } = await supabase.from('profiles').update(profileUpdate).eq('id', sessionUser.id).select('id').single();
      if (error) throw error;
    }
    setSessionUser(updated);
  };
  const login = async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) return { success: false, message: 'Enter a valid email address.' };
    if (!supabase) return { success: false, message: 'Sign-in is unavailable because Supabase is not configured.' };
    setSessionBlocked(false);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (error) return { success: false, message: 'Email or password is incorrect. Please try again.' };
      if (data.user) {
        const { data: profileStatus } = await supabase.from('profiles').select('account_status').eq('id', data.user.id).maybeSingle();
        if (profileStatus?.account_status === 'disabled') {
          setSessionBlocked(true);
          setSessionUser(null);
          setIsAuthenticated(false);
          await supabase.auth.signOut();
          return { success: false, message: 'This account is disabled. Contact an administrator.' };
        }
      }
      const profile = await refreshProfile();
      return profile ? { success: true } : { success: false, message: 'This account is disabled or its profile is unavailable. Contact an administrator.' };
    } catch {
      await supabase.auth.signOut();
      return { success: false, message: 'Unable to load your profile. Please try again.' };
    }
  };
  const logout = () => {
    setIsAuthenticated(false);
    setSessionUser(null);
    setSessionBlocked(false);
    if (supabase) void supabase.auth.signOut();
  };
  const registerUser = async (input: RegisterUserInput) => {
    const email = input.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return { success: false, message: 'Enter a valid email address.' };
    if (!input.name.trim() || !input.department || input.password.length < 6) {
      return { success: false, message: 'Complete all required fields. Passwords must be at least 6 characters.' };
    }
    if (!supabase) return { success: false, message: 'Registration is unavailable because Supabase is not configured.' };
    if (input.role !== 'student' && input.role !== 'teacher') return { success: false, message: 'Choose Student or Teacher to register.' };

    let data;
    let error;
    try {
      ({ data, error } = await supabase.auth.signUp({
        email,
        password: input.password,
        options: { data: {
          name: input.name.trim(),
          role: input.role,
          department: input.department,
          semester: input.role === 'student' ? input.semester ?? null : null,
          teaching_designation: input.role === 'teacher' ? input.designation ?? null : null,
          bio: '',
        } },
      }));
    } catch {
      return { success: false, message: 'Unable to reach Supabase. Check your connection and try again.' };
    }
    if (error) {
      const duplicate = /already registered|already exists|user exists/i.test(error.message);
      return { success: false, message: duplicate ? 'An account with this email already exists. Sign in instead.' : error.message };
    }
    if (!data.user) return { success: false, message: 'Supabase did not return a new account. Please try again.' };
    if (data.user.identities?.length === 0) {
      return { success: false, message: 'An account with this email already exists. Sign in instead.' };
    }

    if (data.session) {
      // The auth trigger normally creates this row. Insert only when the trigger
      // is absent; never upsert user-controlled values over an existing profile.
      const { data: existingProfile, error: lookupError } = await supabase.from('profiles')
        .select('id').eq('id', data.user.id).maybeSingle();
      if (lookupError) {
        await supabase.auth.signOut();
        return { success: false, message: 'Your account was created, but its profile could not be checked. Apply the Stage B profile migration and try signing in.' };
      }
      const { error: profileError } = existingProfile ? { error: null } : await supabase.from('profiles').insert({
        id: data.user.id,
        name: input.name.trim(),
        email,
        role: input.role,
        department: input.department,
        semester: input.role === 'student' ? input.semester ?? null : null,
        teaching_designation: input.role === 'teacher' ? input.designation ?? null : null,
        bio: '',
        account_status: 'active',
      });
      if (profileError) {
        await supabase.auth.signOut();
        return { success: false, message: 'Your account was created, but its profile could not be saved. Apply the Stage B profile migration and try signing in.' };
      }
      const profile = await refreshProfile();
      if (!profile) return { success: false, message: 'Your account was created, but the profile could not be loaded.' };
      return { success: true, authenticated: true };
    }

    return {
      success: true,
      authenticated: false,
      message: 'Check your email to confirm your account, then sign in. If this email is already registered, sign in instead.',
    };
  };
  const hasRole = (...roles: User['role'][]) => isAuthenticated && roles.includes(currentUser.role);

  return (
    <CampusFlowContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        updateCurrentUser,
        users,
        isAuthenticated,
        authLoading,
        sessionBlocked,
        login,
        logout,
        registerUser,
        refreshProfile,
        hasRole,
        resources,
        setResources,
        classrooms,
        setClassrooms,
        classroomAnnouncements,
        setClassroomAnnouncements,
        resourceRequests,
        setResourceRequests,
        notifications,
        setNotifications,
        notificationLoading,
        notificationError,
        addResource,
        removeResource,
        updateResource,
        toggleFavorite,
        addNotification,
        markNotifRead,
        markAllNotifsRead,
        deleteNotif,
        reports,
        addReport,
        updateReportStatus,
        moderationLogs,
        addModerationLog,
        disableUser,
        enableUser,
      }}
    >
      {children}
    </CampusFlowContext.Provider>
  );
};

export const useCampusFlow = () => {
  const context = useContext(CampusFlowContext);
  if (!context) {
    throw new Error('useCampusFlow must be used within a CampusFlowProvider');
  }
  return context;
};
