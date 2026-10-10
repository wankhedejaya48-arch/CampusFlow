import type { ModerationLogEntry, Resource, ResourceReport, User } from '../types';
import type {
  DatabaseAccountStatus,
  DatabaseReportStatus,
  DatabaseResourceStatus,
  ModerationLogRow,
  ProfileRow,
  ReportRow,
  ResourceRow,
} from '../types/database';
import { resourceRowToResource } from './resources';
import { supabase } from './supabase';

export class AdminDataError extends Error {
  constructor(public readonly operation: string, message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = 'AdminDataError';
  }
}

export interface AdminDashboardData {
  users: User[];
  resources: Resource[];
  reports: ResourceReport[];
  moderationLogs: ModerationLogEntry[];
}

function clientFor(operation: string) {
  if (!supabase) throw new AdminDataError(operation, 'Supabase is not configured.');
  return supabase;
}

function wrap(operation: string, error: unknown): AdminDataError {
  return new AdminDataError(operation, error instanceof Error ? error.message : 'Unexpected Admin data error.', error);
}

async function requireActiveAdmin(operation: string) {
  const client = clientFor(operation);
  try {
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError) throw authError;
    if (!user) throw new Error('Sign in with an administrator account.');
    const { data: allowed, error } = await client.rpc('is_admin');
    if (error) throw error;
    if (!allowed) throw new Error('Administrator access required.');
    return { client, user };
  } catch (error) {
    throw wrap(operation, error);
  }
}

function mapUser(row: ProfileRow): User {
  const name = row.name || row.email.split('@')[0] || 'CampusFlow User';
  return {
    id: row.id,
    name,
    email: row.email,
    role: row.role,
    department: row.department ?? '',
    semester: row.semester ?? undefined,
    designation: row.teaching_designation ?? undefined,
    bio: row.bio ?? '',
    uploads: 0,
    downloads: 0,
    avatarInitials: name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
    joinedAt: new Date(row.created_at).toLocaleDateString(),
    accountStatus: row.account_status,
  };
}

function mapReport(row: ReportRow, users: Map<string, User>): ResourceReport {
  const validReasons: ResourceReport['reason'][] = [
    'Incorrect content', 'Spam', 'Inappropriate content', 'Duplicate resource', 'Copyright concern', 'Other',
  ];
  return {
    id: row.id,
    resourceId: row.resource_id ?? '',
    resourceTitle: row.resource_title,
    reporterId: row.reporter_id,
    reporterName: users.get(row.reporter_id)?.name ?? 'CampusFlow Member',
    reason: validReasons.includes(row.reason as ResourceReport['reason']) ? row.reason as ResourceReport['reason'] : 'Other',
    description: row.description,
    createdAt: new Date(row.created_at).toLocaleString(),
    status: row.status,
  };
}

function mapModerationLog(row: ModerationLogRow, users: Map<string, User>): ModerationLogEntry {
  const target = row.details.target;
  return {
    id: row.id,
    action: row.action,
    adminId: row.admin_id,
    adminName: users.get(row.admin_id)?.name ?? 'Administrator',
    target: typeof target === 'string' ? target : row.target_id,
    createdAt: new Date(row.created_at).toLocaleString(),
  };
}

/** All admin data is protected by the trusted is_admin() database function and table RLS. */
export async function fetchAdminDashboardData(): Promise<AdminDashboardData> {
  const operation = 'fetchAdminDashboardData';
  const { client } = await requireActiveAdmin(operation);
  try {
    const [profilesResult, resourcesResult, reportsResult, logsResult] = await Promise.all([
      client.from('profiles').select('*').order('created_at', { ascending: false }),
      client.from('resources').select('*').order('created_at', { ascending: false }),
      client.from('reports').select('*').order('created_at', { ascending: false }),
      client.from('moderation_logs').select('*').order('created_at', { ascending: false }),
    ]);
    if (profilesResult.error) throw profilesResult.error;
    if (resourcesResult.error) throw resourcesResult.error;
    if (reportsResult.error) throw reportsResult.error;
    if (logsResult.error) throw logsResult.error;

    const users = (profilesResult.data ?? []).map(mapUser);
    const userMap = new Map(users.map((user) => [user.id, user]));
    const resources = (resourcesResult.data ?? []).map((row) => resourceRowToResource(row,
      userMap.get(row.uploader_id) ? { name: userMap.get(row.uploader_id)!.name, role: userMap.get(row.uploader_id)!.role } : undefined));
    return {
      users: users.map((user) => ({
        ...user,
        uploads: resources.filter((resource) => resource.uploadedById === user.id).length,
      })),
      resources,
      reports: (reportsResult.data ?? []).map((row) => mapReport(row, userMap)),
      moderationLogs: (logsResult.data ?? []).map((row) => mapModerationLog(row, userMap)),
    };
  } catch (error) {
    throw wrap(operation, error);
  }
}

export async function setAdminUserStatus(userId: string, status: DatabaseAccountStatus): Promise<ProfileRow> {
  const operation = 'setAdminUserStatus';
  if (!userId.trim()) throw new AdminDataError(operation, 'A user ID is required.');
  const { client } = await requireActiveAdmin(operation);
  try {
    const { data, error } = await client.rpc('admin_set_account_status', {
      target_user_id: userId,
      next_status: status,
    });
    if (error) throw error;
    return data;
  } catch (error) {
    throw wrap(operation, error);
  }
}

export async function moderateAdminResource(
  resourceId: string,
  status: Extract<DatabaseResourceStatus, 'approved' | 'rejected'>,
  rejectionReason: string | null,
): Promise<ResourceRow> {
  const operation = 'moderateAdminResource';
  if (!resourceId.trim()) throw new AdminDataError(operation, 'A resource ID is required.');
  const { client } = await requireActiveAdmin(operation);
  try {
    const { data, error } = await client.rpc('admin_moderate_resource', {
      target_resource_id: resourceId,
      target_status: status,
      target_rejection_reason: rejectionReason,
    });
    if (error) throw error;
    return data;
  } catch (error) {
    throw wrap(operation, error);
  }
}

export async function resolveAdminReport(reportId: string, status: Extract<DatabaseReportStatus, 'dismissed'>): Promise<ReportRow> {
  const operation = 'resolveAdminReport';
  if (!reportId.trim()) throw new AdminDataError(operation, 'A report ID is required.');
  const { client } = await requireActiveAdmin(operation);
  try {
    const { data, error } = await client.rpc('admin_resolve_report', {
      target_report_id: reportId,
      target_status: status,
    });
    if (error) throw error;
    return data;
  } catch (error) {
    throw wrap(operation, error);
  }
}

export async function removeReportedResource(resourceId: string): Promise<string | null> {
  const operation = 'removeReportedResource';
  if (!resourceId.trim()) throw new AdminDataError(operation, 'A resource ID is required.');
  const { client } = await requireActiveAdmin(operation);
  try {
    const { data, error } = await client.rpc('admin_remove_reported_resource', { target_resource_id: resourceId });
    if (error) throw error;
    return data;
  } catch (error) {
    throw wrap(operation, error);
  }
}

export async function recordAdminModerationAction(
  action: ModerationLogEntry['action'],
  target: string,
  targetType: 'resource' | 'report' | 'user',
  targetId: string,
): Promise<void> {
  const operation = 'recordAdminModerationAction';
  const { client, user } = await requireActiveAdmin(operation);
  try {
    const { error } = await client.from('moderation_logs').insert({
      admin_id: user.id,
      action,
      target_type: targetType,
      target_id: targetId,
      details: { target },
    });
    if (error) throw error;
  } catch (error) {
    throw wrap(operation, error);
  }
}
