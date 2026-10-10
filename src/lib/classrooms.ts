import { supabase } from './supabase';
import type { AnnouncementRow, ClassroomMemberDirectoryRow, ClassroomMemberRow, ClassroomRow, ResourceRow } from '../types/database';

export class ClassroomDataError extends Error {
  constructor(
    public readonly operation: string,
    message: string,
    public readonly originalError?: unknown,
  ) {
    super(message);
    this.name = 'ClassroomDataError';
  }
}

export interface ClassroomSummary {
  classroom: ClassroomRow;
  memberships: ClassroomMemberDirectoryRow[];
  resourceIds: string[];
  announcementCount?: number;
}

function clientFor(operation: string) {
  if (!supabase) throw new ClassroomDataError(operation, 'Supabase is not configured; use the local classroom fallback.');
  return supabase;
}

function wrapError(operation: string, error: unknown): ClassroomDataError {
  const message = error instanceof Error ? error.message : 'Unexpected classroom data error.';
  if (/duplicate key|already joined|duplicate membership/i.test(message)) {
    if (operation === 'shareResourceWithClassroom') {
      return new ClassroomDataError(operation, 'This resource is already shared with the classroom.', error);
    }
    return new ClassroomDataError(operation, 'You have already joined this classroom.', error);
  }
  return new ClassroomDataError(operation, message, error);
}

async function loadSummaryRows(rows: ClassroomRow[]): Promise<ClassroomSummary[]> {
  if (!rows.length) return [];
  const client = clientFor('fetchClassrooms');
  const ids = rows.map((row) => row.id);
  const [membersResult, linksResult, directResourcesResult] = await Promise.all([
    client.rpc('get_classroom_member_directory', { target_classroom_ids: ids }),
    client.from('classroom_resources').select('classroom_id,resource_id').in('classroom_id', ids),
    client.from('resources').select('id,classroom_id').in('classroom_id', ids),
  ]);
  if (membersResult.error) throw membersResult.error;
  if (linksResult.error) throw linksResult.error;
  if (directResourcesResult.error) throw directResourcesResult.error;

  const membersByRoom = new Map<string, ClassroomMemberDirectoryRow[]>();
  const resourcesByRoom = new Map<string, Set<string>>();
  (membersResult.data ?? []).forEach((member) => {
    const group = membersByRoom.get(member.classroom_id) ?? [];
    group.push(member);
    membersByRoom.set(member.classroom_id, group);
  });
  (linksResult.data ?? []).forEach((link) => {
    const group = resourcesByRoom.get(link.classroom_id) ?? new Set<string>();
    group.add(link.resource_id);
    resourcesByRoom.set(link.classroom_id, group);
  });
  (directResourcesResult.data ?? []).forEach((resource) => {
    if (!resource.classroom_id) return;
    const group = resourcesByRoom.get(resource.classroom_id) ?? new Set<string>();
    group.add(resource.id);
    resourcesByRoom.set(resource.classroom_id, group);
  });

  return rows.map((classroom) => ({
    classroom,
    memberships: membersByRoom.get(classroom.id) ?? [],
    resourceIds: [...(resourcesByRoom.get(classroom.id) ?? new Set<string>())],
  }));
}

/** RLS limits this result to classrooms owned by, joined by, or visible to the signed-in user. */
export async function fetchClassroomsForUser(userId: string): Promise<ClassroomSummary[]> {
  if (!userId.trim()) throw new ClassroomDataError('fetchClassroomsForUser', 'A user ID is required.');
  const client = clientFor('fetchClassroomsForUser');
  try {
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError) throw authError;
    if (!authData.user || authData.user.id !== userId) throw new Error('Sign in as this user to fetch classrooms.');
    const { data, error } = await client.from('classrooms').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return await loadSummaryRows(data ?? []);
  } catch (error) {
    throw wrapError('fetchClassroomsForUser', error);
  }
}

export async function fetchClassroomById(id: string): Promise<ClassroomSummary | null> {
  if (!id.trim()) throw new ClassroomDataError('fetchClassroomById', 'A classroom ID is required.');
  const client = clientFor('fetchClassroomById');
  try {
    const { data, error } = await client.from('classrooms').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const [summary] = await loadSummaryRows([data]);
    return summary ?? null;
  } catch (error) {
    throw wrapError('fetchClassroomById', error);
  }
}

export async function createClassroom(input: {
  name: string;
  subject: string;
  department: string;
  semester: number;
}): Promise<ClassroomSummary> {
  const client = clientFor('createClassroom');
  if (!input.name.trim() || !input.subject.trim() || !input.department.trim()) {
    throw new ClassroomDataError('createClassroom', 'Classroom name, subject, and department are required.');
  }
  if (!Number.isInteger(input.semester) || input.semester < 1 || input.semester > 20) {
    throw new ClassroomDataError('createClassroom', 'Choose a valid semester.');
  }
  try {
    const { data: id, error } = await client.rpc('create_classroom', {
      classroom_name: input.name.trim(),
      classroom_subject: input.subject.trim(),
      classroom_department: input.department.trim(),
      classroom_semester: input.semester,
    });
    if (error) throw error;
    const created = await fetchClassroomById(id);
    if (!created) throw new Error('The classroom was created but could not be loaded.');
    return created;
  } catch (error) {
    throw wrapError('createClassroom', error);
  }
}

export async function joinClassroomByCode(code: string): Promise<ClassroomSummary> {
  const trimmedCode = code.trim().toUpperCase();
  if (!trimmedCode) throw new ClassroomDataError('joinClassroomByCode', 'Enter a classroom code.');
  const client = clientFor('joinClassroomByCode');
  try {
    const { data: id, error } = await client.rpc('join_classroom_with_code', { requested_share_code: trimmedCode });
    if (error) throw error;
    const joined = await fetchClassroomById(id);
    if (!joined) throw new Error('You joined the classroom, but it could not be loaded.');
    return joined;
  } catch (error) {
    throw wrapError('joinClassroomByCode', error);
  }
}

export async function leaveClassroom(classroomId: string): Promise<void> {
  if (!classroomId.trim()) throw new ClassroomDataError('leaveClassroom', 'A classroom ID is required.');
  const client = clientFor('leaveClassroom');
  try {
    const { error } = await client.rpc('leave_classroom', { target_classroom_id: classroomId });
    if (error) throw error;
  } catch (error) {
    throw wrapError('leaveClassroom', error);
  }
}

export async function fetchClassroomMembers(classroomId: string): Promise<ClassroomMemberDirectoryRow[]> {
  if (!classroomId.trim()) throw new ClassroomDataError('fetchClassroomMembers', 'A classroom ID is required.');
  const client = clientFor('fetchClassroomMembers');
  try {
    const { data, error } = await client.rpc('get_classroom_member_directory', { target_classroom_ids: [classroomId] });
    if (error) throw error;
    return data ?? [];
  } catch (error) {
    throw wrapError('fetchClassroomMembers', error);
  }
}

/** Loads linked and classroom-scoped resource records without copying their metadata or files. */
export async function fetchClassroomResources(classroomId: string): Promise<ResourceRow[]> {
  if (!classroomId.trim()) throw new ClassroomDataError('fetchClassroomResources', 'A classroom ID is required.');
  const client = clientFor('fetchClassroomResources');
  try {
    const [linksResult, directResult] = await Promise.all([
      client.from('classroom_resources').select('resource_id').eq('classroom_id', classroomId),
      client.from('resources').select('*').eq('classroom_id', classroomId),
    ]);
    if (linksResult.error) throw linksResult.error;
    if (directResult.error) throw directResult.error;
    const ids = [...new Set((linksResult.data ?? []).map((link) => link.resource_id))];
    const linkedResult = ids.length
      ? await client.from('resources').select('*').in('id', ids)
      : { data: [] as ResourceRow[], error: null };
    if (linkedResult.error) throw linkedResult.error;
    const byId = new Map<string, ResourceRow>();
    [...(directResult.data ?? []), ...(linkedResult.data ?? [])].forEach((resource) => byId.set(resource.id, resource));
    return [...byId.values()];
  } catch (error) {
    throw wrapError('fetchClassroomResources', error);
  }
}

export async function shareResourceWithClassroom(classroomId: string, resourceId: string, userId: string): Promise<void> {
  const client = clientFor('shareResourceWithClassroom');
  try {
    const { error } = await client.from('classroom_resources').insert({
      classroom_id: classroomId,
      resource_id: resourceId,
      shared_by: userId,
    });
    if (error) throw error;
  } catch (error) {
    throw wrapError('shareResourceWithClassroom', error);
  }
}

export interface AnnouncementInput {
  title: string;
  message: string;
}

/** Loads persisted announcements for a classroom. RLS enforces membership access. */
export async function fetchClassroomAnnouncements(classroomId: string): Promise<AnnouncementRow[]> {
  if (!classroomId.trim()) throw new ClassroomDataError('fetchClassroomAnnouncements', 'A classroom ID is required.');
  const client = clientFor('fetchClassroomAnnouncements');
  try {
    const { data, error } = await client.from('announcements').select('*')
      .eq('classroom_id', classroomId).order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  } catch (error) {
    throw wrapError('fetchClassroomAnnouncements', error);
  }
}

/** Returns announcement totals for accessible classrooms without loading message bodies. */
export async function fetchClassroomAnnouncementCounts(classroomIds: string[]): Promise<Record<string, number>> {
  const ids = [...new Set(classroomIds.filter((id) => id.trim()))];
  if (!ids.length) return {};
  const client = clientFor('fetchClassroomAnnouncementCounts');
  try {
    const { data, error } = await client.from('announcements').select('classroom_id').in('classroom_id', ids);
    if (error) throw error;
    return (data ?? []).reduce<Record<string, number>>((counts, row) => {
      counts[row.classroom_id] = (counts[row.classroom_id] ?? 0) + 1;
      return counts;
    }, {});
  } catch (error) {
    throw wrapError('fetchClassroomAnnouncementCounts', error);
  }
}

/** Uses the authenticated Supabase user as the author; database policies verify ownership and role. */
export async function createAnnouncement(classroomId: string, input: AnnouncementInput): Promise<AnnouncementRow> {
  if (!classroomId.trim()) throw new ClassroomDataError('createAnnouncement', 'A classroom ID is required.');
  const title = input.title.trim();
  const message = input.message.trim();
  if (!title || !message) throw new ClassroomDataError('createAnnouncement', 'A title and message are required.');
  const client = clientFor('createAnnouncement');
  try {
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError) throw authError;
    if (!user) throw new Error('Sign in with an active teacher account to post an announcement.');
    const { data, error } = await client.from('announcements').insert({
      classroom_id: classroomId,
      teacher_id: user.id,
      title,
      message,
    }).select('*').single();
    if (error) throw error;
    return data;
  } catch (error) {
    throw wrapError('createAnnouncement', error);
  }
}

/** Updates only announcement content. RLS limits this to active classroom owners/admins. */
export async function updateAnnouncement(announcementId: string, input: AnnouncementInput): Promise<AnnouncementRow> {
  if (!announcementId.trim()) throw new ClassroomDataError('updateAnnouncement', 'An announcement ID is required.');
  const title = input.title.trim();
  const message = input.message.trim();
  if (!title || !message) throw new ClassroomDataError('updateAnnouncement', 'A title and message are required.');
  const client = clientFor('updateAnnouncement');
  try {
    const { data, error } = await client.from('announcements').update({ title, message }).eq('id', announcementId).select('*').single();
    if (error) throw error;
    return data;
  } catch (error) {
    throw wrapError('updateAnnouncement', error);
  }
}

/** Deletes one persisted announcement. RLS limits this to active classroom owners/admins. */
export async function deleteAnnouncement(announcementId: string): Promise<void> {
  if (!announcementId.trim()) throw new ClassroomDataError('deleteAnnouncement', 'An announcement ID is required.');
  const client = clientFor('deleteAnnouncement');
  try {
    const { error } = await client.from('announcements').delete().eq('id', announcementId);
    if (error) throw error;
  } catch (error) {
    throw wrapError('deleteAnnouncement', error);
  }
}
