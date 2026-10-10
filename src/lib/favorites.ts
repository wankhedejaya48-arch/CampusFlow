import type { Resource } from '../types';
import { resourceRowToResource } from './resources';
import { supabase } from './supabase';

export class FavoriteDataError extends Error {
  constructor(public readonly operation: string, message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = 'FavoriteDataError';
  }
}

function clientFor(operation: string) {
  if (!supabase) throw new FavoriteDataError(operation, 'Supabase is not configured; use the local favorites fallback.');
  return supabase;
}

function wrapError(operation: string, error: unknown): FavoriteDataError {
  return new FavoriteDataError(operation, error instanceof Error ? error.message : 'Unexpected favorites error.', error);
}

async function requireUserId(operation: string): Promise<string> {
  const client = clientFor(operation);
  const { data: { user }, error } = await client.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error('Sign in to manage your favorites.');
  return user.id;
}

export async function fetchFavoriteResourceIds(): Promise<Set<string>> {
  const operation = 'fetchFavoriteResourceIds';
  const client = clientFor(operation);
  try {
    const userId = await requireUserId(operation);
    const { data, error } = await client.from('favorites').select('resource_id')
      .eq('user_id', userId).order('created_at', { ascending: false });
    if (error) throw error;
    return new Set((data ?? []).map((favorite) => favorite.resource_id));
  } catch (error) {
    throw wrapError(operation, error);
  }
}

/** Loads the current user's favorite records and their readable resource rows in two queries. */
export async function fetchUserFavorites(): Promise<Resource[]> {
  const operation = 'fetchUserFavorites';
  const client = clientFor(operation);
  try {
    const userId = await requireUserId(operation);
    const { data: favorites, error: favoritesError } = await client.from('favorites').select('resource_id')
      .eq('user_id', userId).order('created_at', { ascending: false });
    if (favoritesError) throw favoritesError;
    const resourceIds = [...new Set((favorites ?? []).map((favorite) => favorite.resource_id))];
    if (!resourceIds.length) return [];
    const { data: rows, error: resourcesError } = await client.from('resources').select('*').in('id', resourceIds);
    if (resourcesError) throw resourcesError;
    const resourcesById = new Map((rows ?? []).map((row) => [row.id, row]));
    return resourceIds.flatMap((id) => {
      const row = resourcesById.get(id);
      return row ? [{ ...resourceRowToResource(row), isFavorited: true }] : [];
    });
  } catch (error) {
    throw wrapError(operation, error);
  }
}

export async function isResourceFavorited(resourceId: string): Promise<boolean> {
  const operation = 'isResourceFavorited';
  if (!resourceId.trim()) throw new FavoriteDataError(operation, 'A resource ID is required.');
  const client = clientFor(operation);
  try {
    const userId = await requireUserId(operation);
    const { data, error } = await client.from('favorites').select('resource_id')
      .eq('user_id', userId).eq('resource_id', resourceId).maybeSingle();
    if (error) throw error;
    return data !== null;
  } catch (error) {
    throw wrapError(operation, error);
  }
}

export async function addFavorite(resourceId: string): Promise<void> {
  const operation = 'addFavorite';
  if (!resourceId.trim()) throw new FavoriteDataError(operation, 'A resource ID is required.');
  const client = clientFor(operation);
  try {
    const userId = await requireUserId(operation);
    const { error } = await client.from('favorites').upsert(
      { user_id: userId, resource_id: resourceId },
      { onConflict: 'user_id,resource_id', ignoreDuplicates: true },
    );
    if (error) throw error;
  } catch (error) {
    throw wrapError(operation, error);
  }
}

/** Missing favorites are treated as an already-completed unfavorite. */
export async function removeFavorite(resourceId: string): Promise<void> {
  const operation = 'removeFavorite';
  if (!resourceId.trim()) throw new FavoriteDataError(operation, 'A resource ID is required.');
  const client = clientFor(operation);
  try {
    const userId = await requireUserId(operation);
    const { error } = await client.from('favorites').delete().eq('user_id', userId).eq('resource_id', resourceId);
    if (error) throw error;
  } catch (error) {
    throw wrapError(operation, error);
  }
}

export async function toggleFavorite(resourceId: string): Promise<boolean> {
  const favorited = await isResourceFavorited(resourceId);
  if (favorited) await removeFavorite(resourceId);
  else await addFavorite(resourceId);
  return !favorited;
}
