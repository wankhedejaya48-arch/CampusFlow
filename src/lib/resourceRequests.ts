import type { ResourceRequest } from '../types';
import type { ResourceRequestRow } from '../types/database';
import { supabase } from './supabase';

export class ResourceRequestDataError extends Error {
  constructor(public readonly operation: string, message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = 'ResourceRequestDataError';
  }
}

export interface CreateResourceRequestInput {
  title: string;
  subject: string;
  description: string;
  semester: number;
  type: ResourceRequest['type'];
}

export type UpdateResourceRequestInput = Partial<CreateResourceRequestInput>;

function clientFor(operation: string) {
  if (!supabase) throw new ResourceRequestDataError(operation, 'Supabase is not configured; use the local requests fallback.');
  return supabase;
}

function wrapError(operation: string, error: unknown): ResourceRequestDataError {
  const message = error instanceof Error ? error.message : 'Unexpected resource request error.';
  return new ResourceRequestDataError(operation, message, error);
}

function validateInput(input: UpdateResourceRequestInput, requireAll: boolean): void {
  if (requireAll && (!input.title?.trim() || !input.subject?.trim())) {
    throw new ResourceRequestDataError('validateResourceRequest', 'A request title and subject are required.');
  }
  if (input.title !== undefined && !input.title.trim()) throw new ResourceRequestDataError('validateResourceRequest', 'A request title cannot be empty.');
  if (input.subject !== undefined && !input.subject.trim()) throw new ResourceRequestDataError('validateResourceRequest', 'A subject cannot be empty.');
  if (input.semester !== undefined && (!Number.isInteger(input.semester) || input.semester < 1 || input.semester > 20)) {
    throw new ResourceRequestDataError('validateResourceRequest', 'Semester must be between 1 and 20.');
  }
}

export function resourceRequestRowToResourceRequest(row: ResourceRequestRow): ResourceRequest {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(row.created_at).getTime()) / 1000));
  const requestedAt = elapsedSeconds < 60 ? 'Just now'
    : elapsedSeconds < 3600 ? `${Math.floor(elapsedSeconds / 60)} min ago`
      : elapsedSeconds < 86400 ? `${Math.floor(elapsedSeconds / 3600)} hr ago`
        : elapsedSeconds < 604800 ? `${Math.floor(elapsedSeconds / 86400)} day${Math.floor(elapsedSeconds / 86400) === 1 ? '' : 's'} ago`
          : new Date(row.created_at).toLocaleDateString();
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    description: row.description,
    semester: row.semester,
    type: row.resource_type,
    requestedBy: row.requester_name,
    requestedAt,
    status: row.status,
    responses: row.responses,
  };
}

/** RLS returns requests visible to the authenticated user and eligible teachers/admins. */
export async function fetchResourceRequests(): Promise<ResourceRequestRow[]> {
  const client = clientFor('fetchResourceRequests');
  try {
    const { data, error } = await client.from('resource_requests').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  } catch (error) {
    throw wrapError('fetchResourceRequests', error);
  }
}

/** A user can request their own rows only; RLS remains the authorization boundary. */
export async function fetchUserResourceRequests(userId: string): Promise<ResourceRequestRow[]> {
  if (!userId.trim()) throw new ResourceRequestDataError('fetchUserResourceRequests', 'A user ID is required.');
  const client = clientFor('fetchUserResourceRequests');
  try {
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError) throw authError;
    if (!user) throw new Error('Sign in to load resource requests.');
    if (user.id !== userId) throw new Error('You can only load your own resource requests.');
    const { data, error } = await client.from('resource_requests').select('*')
      .eq('requester_id', user.id).order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  } catch (error) {
    throw wrapError('fetchUserResourceRequests', error);
  }
}

export async function fetchResourceRequestById(requestId: string): Promise<ResourceRequestRow | null> {
  if (!requestId.trim()) throw new ResourceRequestDataError('fetchResourceRequestById', 'A request ID is required.');
  const client = clientFor('fetchResourceRequestById');
  try {
    const { data, error } = await client.from('resource_requests').select('*').eq('id', requestId).maybeSingle();
    if (error) throw error;
    return data;
  } catch (error) {
    throw wrapError('fetchResourceRequestById', error);
  }
}

export async function createResourceRequest(input: CreateResourceRequestInput): Promise<ResourceRequestRow> {
  validateInput(input, true);
  const client = clientFor('createResourceRequest');
  try {
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError) throw authError;
    if (!user) throw new Error('Sign in to submit a resource request.');
    const { data, error } = await client.from('resource_requests').insert({
      requester_id: user.id,
      title: input.title.trim(),
      subject: input.subject.trim(),
      description: input.description.trim(),
      semester: input.semester,
      resource_type: input.type,
    }).select('*').single();
    if (error) throw error;
    return data;
  } catch (error) {
    throw wrapError('createResourceRequest', error);
  }
}

/** Updates request content only; ownership, status, and response count are database controlled. */
export async function updateResourceRequest(requestId: string, input: UpdateResourceRequestInput): Promise<ResourceRequestRow> {
  if (!requestId.trim()) throw new ResourceRequestDataError('updateResourceRequest', 'A request ID is required.');
  validateInput(input, false);
  const update = {
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.subject !== undefined ? { subject: input.subject.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description.trim() } : {}),
    ...(input.semester !== undefined ? { semester: input.semester } : {}),
    ...(input.type !== undefined ? { resource_type: input.type } : {}),
  };
  if (Object.keys(update).length === 0) throw new ResourceRequestDataError('updateResourceRequest', 'At least one request field must be provided.');
  const client = clientFor('updateResourceRequest');
  try {
    const { data, error } = await client.from('resource_requests').update(update).eq('id', requestId).select('*').single();
    if (error) throw error;
    return data;
  } catch (error) {
    throw wrapError('updateResourceRequest', error);
  }
}

export async function deleteResourceRequest(requestId: string): Promise<void> {
  if (!requestId.trim()) throw new ResourceRequestDataError('deleteResourceRequest', 'A request ID is required.');
  const client = clientFor('deleteResourceRequest');
  try {
    const { data, error } = await client.from('resource_requests').delete().eq('id', requestId).select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Request not found or you are not authorized to delete it.');
  } catch (error) {
    throw wrapError('deleteResourceRequest', error);
  }
}
