import type { Notification } from '../types';
import type { NotificationRow } from '../types/database';
import { supabase } from './supabase';

export class NotificationDataError extends Error {
  constructor(public readonly operation: string, message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = 'NotificationDataError';
  }
}

function clientFor(operation: string) {
  if (!supabase) throw new NotificationDataError(operation, 'Supabase is not configured; use local notification state.');
  return supabase;
}

function wrapError(operation: string, error: unknown): NotificationDataError {
  return new NotificationDataError(operation, error instanceof Error ? error.message : 'Unexpected notification error.', error);
}

async function authenticatedUserId(operation: string): Promise<string> {
  const client = clientFor(operation);
  const { data: { user }, error } = await client.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error('Sign in to access notifications.');
  return user.id;
}

function relativeTime(timestamp: string): string {
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  if (!Number.isFinite(elapsed) || elapsed < 60) return 'Just now';
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)} min ago`;
  if (elapsed < 86400) return `${Math.floor(elapsed / 3600)} hr ago`;
  const days = Math.floor(elapsed / 86400);
  return days < 7 ? `${days} day${days === 1 ? '' : 's'} ago` : new Date(timestamp).toLocaleDateString();
}

export function notificationRowToNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    message: row.message,
    time: relativeTime(row.created_at),
    read: row.read,
  };
}

export async function fetchNotifications(): Promise<NotificationRow[]> {
  const operation = 'fetchNotifications';
  const client = clientFor(operation);
  try {
    const userId = await authenticatedUserId(operation);
    const { data, error } = await client.from('notifications').select('*')
      .eq('user_id', userId).order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  } catch (error) {
    throw wrapError(operation, error);
  }
}

export async function fetchUnreadNotifications(): Promise<NotificationRow[]> {
  const operation = 'fetchUnreadNotifications';
  const client = clientFor(operation);
  try {
    const userId = await authenticatedUserId(operation);
    const { data, error } = await client.from('notifications').select('*')
      .eq('user_id', userId).eq('read', false).order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  } catch (error) {
    throw wrapError(operation, error);
  }
}

export async function getUnreadNotificationCount(): Promise<number> {
  const operation = 'getUnreadNotificationCount';
  const client = clientFor(operation);
  try {
    const userId = await authenticatedUserId(operation);
    const { count, error } = await client.from('notifications').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('read', false);
    if (error) throw error;
    return count ?? 0;
  } catch (error) {
    throw wrapError(operation, error);
  }
}

export async function markNotificationAsRead(notificationId: string): Promise<NotificationRow | null> {
  const operation = 'markNotificationAsRead';
  if (!notificationId.trim()) throw new NotificationDataError(operation, 'A notification ID is required.');
  const client = clientFor(operation);
  try {
    const userId = await authenticatedUserId(operation);
    const { data, error } = await client.from('notifications').update({ read: true })
      .eq('id', notificationId).eq('user_id', userId).select('*').maybeSingle();
    if (error) throw error;
    return data;
  } catch (error) {
    throw wrapError(operation, error);
  }
}

export async function markAllNotificationsAsRead(): Promise<void> {
  const operation = 'markAllNotificationsAsRead';
  const client = clientFor(operation);
  try {
    const userId = await authenticatedUserId(operation);
    const { error } = await client.from('notifications').update({ read: true })
      .eq('user_id', userId).eq('read', false);
    if (error) throw error;
  } catch (error) {
    throw wrapError(operation, error);
  }
}

export async function deleteNotification(notificationId: string): Promise<void> {
  const operation = 'deleteNotification';
  if (!notificationId.trim()) throw new NotificationDataError(operation, 'A notification ID is required.');
  const client = clientFor(operation);
  try {
    const userId = await authenticatedUserId(operation);
    const { error } = await client.from('notifications').delete()
      .eq('id', notificationId).eq('user_id', userId);
    if (error) throw error;
  } catch (error) {
    throw wrapError(operation, error);
  }
}

/** Admin Dashboard's existing verification events may notify another user; the DB RPC authorizes admins only. */
export async function createAdminVerificationNotification(notification: Pick<Notification, 'userId' | 'title' | 'message'>): Promise<NotificationRow> {
  const operation = 'createAdminVerificationNotification';
  if (!notification.userId?.trim()) throw new NotificationDataError(operation, 'A recipient is required.');
  if (!notification.title.trim() || !notification.message.trim()) throw new NotificationDataError(operation, 'A title and message are required.');
  const client = clientFor(operation);
  try {
    const { data, error } = await client.rpc('create_admin_verification_notification', {
      target_user_id: notification.userId,
      notification_title: notification.title.trim(),
      notification_message: notification.message.trim(),
    });
    if (error) throw error;
    return data;
  } catch (error) {
    throw wrapError(operation, error);
  }
}
