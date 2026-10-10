import { currentUser as mockCurrentUser, myUploads as mockUserUploads, resources as mockResources } from '../data/mockData';
import type { Resource, UserRole } from '../types';
import { supabase } from './supabase';
import type { ResourceInsert, ResourceRow, ResourceUpdate } from '../types/database';

/** Typed errors keep transport/RLS failures distinct from an empty result. */
export class ResourceDataError extends Error {
  constructor(
    public readonly operation: string,
    message: string,
    public readonly originalError?: unknown,
  ) {
    super(message);
    this.name = 'ResourceDataError';
  }
}

export function resourceRowToResource(row: ResourceRow, uploader?: { name: string; role: UserRole }): Resource {
  const fileName = row.original_file_name ?? undefined;
  const extension = fileName?.split('.').pop()?.toUpperCase();
  const sizeMb = (row.file_size ?? 0) / (1024 * 1024);
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    semester: row.semester,
    department: row.department,
    type: row.resource_type,
    description: row.description ?? '',
    uploadedBy: uploader?.name ?? (row.uploader_id === mockCurrentUser.id ? mockCurrentUser.name : 'CampusFlow Member'),
    uploadedById: row.uploader_id,
    uploadedByRole: uploader?.role ?? (row.uploader_id === mockCurrentUser.id ? mockCurrentUser.role : 'student'),
    uploadedAt: new Date(row.created_at).toLocaleDateString(),
    views: row.views,
    downloads: row.downloads,
    rating: row.rating,
    ratingCount: row.rating_count,
    verified: row.status === 'approved' ? 'verified' : row.status,
    tags: row.tags ?? [],
    fileSize: row.file_size == null ? '—' : `${sizeMb < 0.01 ? '<0.01' : sizeMb.toFixed(2)} MB`,
    fileType: extension ?? row.mime_type?.split('/').pop()?.toUpperCase() ?? 'FILE',
    fileId: row.storage_path ?? undefined,
    storageProvider: row.storage_path ? 'supabase' : undefined,
    resourceSource: 'supabase',
    originalFileName: fileName,
    classroomId: row.classroom_id ?? undefined,
    visibility: row.visibility,
    rejectionReason: row.rejection_reason ?? undefined,
  };
}

const localStorageKey = 'campusflow_resources';
const fallbackCacheKey = 'campusflow_resource_data_fallback';

function resourceToRow(resource: Resource): ResourceRow {
  const fileSizeMatch = resource.fileSize.match(/^\s*(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?\s*$/i);
  const sizeUnits = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 } as const;
  const fileSize = fileSizeMatch
    ? Math.round(Number(fileSizeMatch[1]) * sizeUnits[(fileSizeMatch[2]?.toUpperCase() || 'B') as keyof typeof sizeUnits])
    : null;
  const parsedDate = new Date(resource.uploadedAt);

  return {
    id: resource.id,
    title: resource.title,
    description: resource.description,
    subject: resource.subject,
    semester: resource.semester,
    department: resource.department,
    resource_type: resource.type,
    tags: [...resource.tags],
    uploader_id: resource.uploadedById ?? `local:${resource.uploadedBy}`,
    status: resource.verified === 'verified' ? 'approved' : resource.verified,
    visibility: resource.visibility ?? 'public',
    classroom_id: resource.classroomId ?? null,
    storage_path: null,
    original_file_name: null,
    mime_type: null,
    file_size: fileSize,
    views: resource.views,
    downloads: resource.downloads,
    rating: resource.rating,
    rating_count: resource.ratingCount,
    rejection_reason: resource.rejectionReason ?? null,
    created_at: Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString(),
    updated_at: Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString(),
  };
}

/** Use current local resources while Supabase is unconfigured; retain mock data as a last fallback. */
function getLocalFallbackRows(): ResourceRow[] {
  if (typeof window !== 'undefined') {
    try {
      const cachedRows = window.localStorage.getItem(fallbackCacheKey);
      if (cachedRows) {
        const parsed: unknown = JSON.parse(cachedRows);
        if (Array.isArray(parsed) && parsed.every(isResourceRow)) return parsed as ResourceRow[];
      }
      const stored = window.localStorage.getItem(localStorageKey);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) return (parsed as Resource[]).map(resourceToRow);
      }
    } catch {
      // Malformed/blocked local state falls back to the shipped sample resources.
    }
  }
  return [...mockResources, ...mockUserUploads].map(resourceToRow);
}

function isResourceRow(value: unknown): value is ResourceRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<ResourceRow>;
  return typeof row.id === 'string'
    && typeof row.title === 'string'
    && typeof row.subject === 'string'
    && typeof row.uploader_id === 'string';
}

function saveLocalFallbackRows(rows: ResourceRow[]): void {
  if (typeof window === 'undefined') {
    throw new ResourceDataError('localFallback', 'Local resource fallback is unavailable outside the browser.');
  }
  try {
    window.localStorage.setItem(fallbackCacheKey, JSON.stringify(rows));
  } catch (error) {
    throw wrapError('localFallback', error);
  }
}

function createFallbackRow(input: ResourceInsert): ResourceRow {
  const now = new Date().toISOString();
  return {
    id: input.id ?? `local-resource-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
    title: input.title,
    description: input.description ?? '',
    subject: input.subject,
    semester: input.semester,
    department: input.department,
    resource_type: input.resource_type,
    tags: input.tags ?? [],
    uploader_id: input.uploader_id,
    status: input.status ?? 'pending',
    visibility: input.visibility ?? 'public',
    classroom_id: input.classroom_id ?? null,
    storage_path: input.storage_path ?? null,
    original_file_name: input.original_file_name ?? null,
    mime_type: input.mime_type ?? null,
    file_size: input.file_size ?? null,
    views: input.views ?? 0,
    downloads: input.downloads ?? 0,
    rating: input.rating ?? 0,
    rating_count: input.rating_count ?? 0,
    rejection_reason: input.rejection_reason ?? null,
    created_at: input.created_at ?? now,
    updated_at: input.updated_at ?? now,
  };
}

function wrapError(operation: string, error: unknown): ResourceDataError {
  const detail = error instanceof Error ? error.message : 'Unexpected resource data error.';
  return new ResourceDataError(operation, detail, error);
}

function requireSupabase(operation: string) {
  if (!supabase) {
    throw new ResourceDataError(operation, 'Supabase is not configured; resource writes are not available in this preparation step.');
  }
  return supabase;
}

/** Fetch resources from Supabase, falling back to local/mock records only when unconfigured. */
export async function fetchResources(): Promise<ResourceRow[]> {
  if (!supabase) return getLocalFallbackRows();
  try {
    const { data, error } = await supabase.from('resources').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  } catch (error) {
    throw wrapError('fetchResources', error);
  }
}

/** Fetch one resource; null means it does not exist or is not visible under RLS. */
export async function fetchResourceById(id: string): Promise<ResourceRow | null> {
  if (!id.trim()) throw new ResourceDataError('fetchResourceById', 'A resource ID is required.');
  if (!supabase) return getLocalFallbackRows().find((resource) => resource.id === id) ?? null;
  try {
    const { data, error } = await supabase.from('resources').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  } catch (error) {
    throw wrapError('fetchResourceById', error);
  }
}

/** Fetch resources owned by the given profile. */
export async function fetchUserResources(userId: string): Promise<ResourceRow[]> {
  if (!userId.trim()) throw new ResourceDataError('fetchUserResources', 'A user ID is required.');
  if (!supabase) {
    return getLocalFallbackRows().filter((resource) =>
      resource.uploader_id === userId ||
      (userId === mockCurrentUser.id && mockUserUploads.some((mock) => mock.id === resource.id)),
    );
  }
  try {
    const { data, error } = await supabase.from('resources').select('*').eq('uploader_id', userId).order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  } catch (error) {
    throw wrapError('fetchUserResources', error);
  }
}

/** Create a resource record; callers may upload its file separately before inserting metadata. */
export async function createResource(input: ResourceInsert): Promise<ResourceRow> {
  if (!supabase) {
    const row = createFallbackRow(input);
    saveLocalFallbackRows([...getLocalFallbackRows(), row]);
    return row;
  }
  const client = requireSupabase('createResource');
  try {
    const { data, error } = await client.from('resources').insert(input).select('*').single();
    if (error) throw error;
    return data;
  } catch (error) {
    throw wrapError('createResource', error);
  }
}

export async function updateResource(id: string, changes: ResourceUpdate): Promise<ResourceRow> {
  if (!id.trim()) throw new ResourceDataError('updateResource', 'A resource ID is required.');
  if (!supabase) {
    const rows = getLocalFallbackRows();
    const index = rows.findIndex((resource) => resource.id === id);
    if (index === -1) throw new ResourceDataError('updateResource', 'Resource not found.');
    const updated = { ...rows[index], ...changes, id: rows[index].id, uploader_id: rows[index].uploader_id, created_at: rows[index].created_at, updated_at: new Date().toISOString() };
    rows[index] = updated;
    saveLocalFallbackRows(rows);
    return updated;
  }
  const client = requireSupabase('updateResource');
  try {
    const { data, error } = await client.from('resources').update(changes).eq('id', id).select('*').single();
    if (error) throw error;
    return data;
  } catch (error) {
    throw wrapError('updateResource', error);
  }
}

/** Atomically increments a resource counter through a restricted database function. */
export async function incrementResourceCounter(id: string, counter: 'views' | 'downloads'): Promise<number> {
  if (!id.trim()) throw new ResourceDataError('incrementResourceCounter', 'A resource ID is required.');
  const client = requireSupabase('incrementResourceCounter');
  try {
    const { data, error } = await client.rpc('increment_resource_counter', {
      target_resource_id: id,
      counter_name: counter,
    });
    if (error) throw error;
    return data;
  } catch (error) {
    throw wrapError('incrementResourceCounter', error);
  }
}

export async function deleteResource(id: string): Promise<void> {
  if (!id.trim()) throw new ResourceDataError('deleteResource', 'A resource ID is required.');
  if (!supabase) {
    const rows = getLocalFallbackRows();
    const updatedRows = rows.filter((resource) => resource.id !== id);
    if (updatedRows.length === rows.length) throw new ResourceDataError('deleteResource', 'Resource not found.');
    saveLocalFallbackRows(updatedRows);
    return;
  }
  const client = requireSupabase('deleteResource');
  try {
    const { data, error } = await client.from('resources').delete().eq('id', id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new ResourceDataError('deleteResource', 'Resource not found or deletion is not authorized.');
  } catch (error) {
    if (error instanceof ResourceDataError) throw error;
    throw wrapError('deleteResource', error);
  }
}
