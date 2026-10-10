import type { ResourceReport } from '../types';
import type { ReportRow } from '../types/database';
import { supabase } from './supabase';

export class ReportDataError extends Error {
  constructor(public readonly operation: string, message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = 'ReportDataError';
  }
}

function clientFor(operation: string) {
  if (!supabase) throw new ReportDataError(operation, 'Supabase is not configured.');
  return supabase;
}

function wrap(operation: string, error: unknown): ReportDataError {
  return new ReportDataError(operation, error instanceof Error ? error.message : 'Unexpected report error.', error);
}

const reportReasons: ResourceReport['reason'][] = [
  'Incorrect content', 'Spam', 'Inappropriate content', 'Duplicate resource', 'Copyright concern', 'Other',
];

function mapRow(row: ReportRow, reporterName: string, resourceTitle: string): ResourceReport {
  return {
    id: row.id,
    resourceId: row.resource_id ?? '',
    resourceTitle,
    reporterId: row.reporter_id,
    reporterName,
    reason: reportReasons.includes(row.reason as ResourceReport['reason']) ? row.reason as ResourceReport['reason'] : 'Other',
    description: row.description,
    createdAt: new Date(row.created_at).toLocaleString(),
    status: row.status,
  };
}

async function getCurrentUser(operation: string) {
  const client = clientFor(operation);
  const { data: { user }, error } = await client.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error('Sign in to access resource reports.');
  return { client, user };
}

/** Fetches only the caller's submitted reports; RLS independently enforces ownership. */
export async function fetchMyReports(): Promise<ResourceReport[]> {
  const operation = 'fetchMyReports';
  try {
    const { client, user } = await getCurrentUser(operation);
    const { data, error } = await client.from('reports').select('*')
      .eq('reporter_id', user.id).order('created_at', { ascending: false });
    if (error) throw error;
    const rows = data ?? [];
    if (!rows.length) return [];
    const profileResult = await client.from('profiles').select('name').eq('id', user.id).maybeSingle();
    if (profileResult.error) throw profileResult.error;
    const reporterName = profileResult.data?.name ?? user.email?.split('@')[0] ?? 'CampusFlow Member';
    return rows.map((row) => mapRow(row, reporterName, row.resource_title));
  } catch (error) {
    throw wrap(operation, error);
  }
}

/** The recipient and resource title come from the authenticated session/database, not caller-supplied fields. */
export async function createResourceReport(input: Pick<ResourceReport, 'resourceId' | 'reason' | 'description'>): Promise<ResourceReport> {
  const operation = 'createResourceReport';
  if (!input.resourceId.trim()) throw new ReportDataError(operation, 'A resource ID is required.');
  if (!reportReasons.includes(input.reason)) throw new ReportDataError(operation, 'Choose a valid report reason.');
  try {
    const { client, user } = await getCurrentUser(operation);
    const [resourceResult, profileResult] = await Promise.all([
      client.from('resources').select('id,title').eq('id', input.resourceId).maybeSingle(),
      client.from('profiles').select('name').eq('id', user.id).maybeSingle(),
    ]);
    if (resourceResult.error) throw resourceResult.error;
    if (profileResult.error) throw profileResult.error;
    if (!resourceResult.data) throw new Error('This resource is not available to report.');
    const { data, error } = await client.from('reports').insert({
      resource_id: resourceResult.data.id,
      reporter_id: user.id,
      reason: input.reason,
      description: input.description.trim().slice(0, 2000),
    }).select('*').single();
    if (error) throw error;
    return mapRow(data, profileResult.data?.name ?? user.email?.split('@')[0] ?? 'CampusFlow Member', resourceResult.data.title);
  } catch (error) {
    throw wrap(operation, error);
  }
}
