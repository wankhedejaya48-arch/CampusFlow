import { isSupabaseConfigured, supabase } from './supabase';

export const RESOURCE_BUCKET = 'resources';
export const MAX_RESOURCE_FILE_SIZE = 20 * 1024 * 1024;
export const SUPPORTED_RESOURCE_EXTENSIONS = ['pdf', 'ppt', 'pptx', 'doc', 'docx', 'xlsx', 'zip'] as const;

export class StorageDataError extends Error {
  constructor(message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = 'StorageDataError';
  }
}

export interface UploadedResourceFile {
  path: string;
  fileName: string;
  contentType: string;
  size: number;
}

export interface DownloadedResourceFile {
  blob: Blob;
  contentType: string;
}

export function validateResourceFile(file: File | null | undefined): string | null {
  if (!file) return 'Choose a file to upload.';
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !SUPPORTED_RESOURCE_EXTENSIONS.includes(extension as typeof SUPPORTED_RESOURCE_EXTENSIONS[number])) {
    return 'Choose a PDF, PPT, PPTX, DOC, DOCX, XLSX, or ZIP file.';
  }
  if (file.size <= 0) return 'The selected file is empty.';
  if (file.size > MAX_RESOURCE_FILE_SIZE) return 'The selected file is larger than 20 MB.';
  return null;
}

function getClient(operation: string) {
  if (!isSupabaseConfigured || !supabase) {
    throw new StorageDataError(`Supabase is not configured; ${operation} is unavailable.`);
  }
  return supabase;
}

function explainStorageError(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  if (/bucket.*not found|not found.*bucket|bucket does not exist/i.test(detail)) {
    return `The private "${RESOURCE_BUCKET}" bucket is missing. Create it in the Supabase Dashboard, then retry. (${detail})`;
  }
  return detail;
}

function safeFileName(fileName: string): string {
  const normalized = fileName.normalize('NFKD').replace(/[\\/]/g, '_');
  const safe = normalized.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').slice(-120);
  return safe || 'resource-file';
}

async function requireCurrentUser(expectedUserId?: string) {
  const client = getClient('Storage access');
  const { data, error } = await client.auth.getUser();
  if (error) throw new StorageDataError(`Could not verify your Supabase session: ${error.message}`, error);
  if (!data.user) throw new StorageDataError('Sign in before uploading or deleting resource files.');
  if (expectedUserId && data.user.id !== expectedUserId) {
    throw new StorageDataError('The signed-in user does not match the resource owner.');
  }
  return { client, user: data.user };
}

function validateStoragePath(path: string): string {
  if (!path.trim() || path.startsWith('/') || path.includes('://')
    || path.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new StorageDataError('The resource Storage path is invalid.');
  }
  return path;
}

/** Creates a temporary URL for an authenticated PDF preview; never returns a public URL. */
export async function createResourceSignedUrl(path: string, expiresIn = 300): Promise<string> {
  const safePath = validateStoragePath(path);
  if (!Number.isInteger(expiresIn) || expiresIn < 60 || expiresIn > 600) {
    throw new StorageDataError('Signed URL expiration must be between 60 and 600 seconds.');
  }
  const { client } = await requireCurrentUser();
  try {
    const { data, error } = await client.storage.from(RESOURCE_BUCKET).createSignedUrl(safePath, expiresIn);
    if (error) throw error;
    if (!data?.signedUrl) throw new Error('Supabase did not return a signed URL.');
    return data.signedUrl;
  } catch (error) {
    throw new StorageDataError(`Could not create a temporary resource preview URL: ${explainStorageError(error)}`, error);
  }
}

/** Downloads a private object as a Blob under the current authenticated session. */
export async function downloadResourceFile(path: string): Promise<DownloadedResourceFile> {
  const safePath = validateStoragePath(path);
  const { client } = await requireCurrentUser();
  try {
    const { data, error } = await client.storage.from(RESOURCE_BUCKET).download(safePath);
    if (error) throw error;
    if (!data) throw new Error('Supabase returned no file data.');
    return { blob: data, contentType: data.type || 'application/octet-stream' };
  } catch (error) {
    throw new StorageDataError(`Could not download the resource file: ${explainStorageError(error)}`, error);
  }
}

/** Uploads a new object without upsert, under the authenticated user's Storage folder. */
export async function uploadResourceFile(file: File | null | undefined, userId: string): Promise<UploadedResourceFile> {
  const validationError = validateResourceFile(file);
  if (validationError) throw new StorageDataError(validationError);
  if (!userId.trim()) throw new StorageDataError('A signed-in user is required to upload a resource.');
  const { client } = await requireCurrentUser(userId);
  const selectedFile = file as File;
  const path = `${userId}/${globalThis.crypto.randomUUID()}-${safeFileName(selectedFile.name)}`;
  const contentType = selectedFile.type || 'application/octet-stream';

  try {
    const { error } = await client.storage.from(RESOURCE_BUCKET).upload(path, selectedFile, {
      cacheControl: '3600',
      contentType,
      upsert: false,
    });
    if (error) throw error;
    return { path, fileName: selectedFile.name, contentType, size: selectedFile.size };
  } catch (error) {
    throw new StorageDataError(`Resource file upload failed: ${explainStorageError(error)}`, error);
  }
}

/** Removes only an object owned by the currently authenticated user. */
export async function deleteResourceFile(path: string): Promise<void> {
  if (!path.trim()) throw new StorageDataError('A Storage object path is required.');
  const { client, user } = await requireCurrentUser();
  validateStoragePath(path);
  if (path.split('/')[0] !== user.id) {
    throw new StorageDataError('You can only delete files in your own Storage folder.');
  }
  try {
    const bucket = client.storage.from(RESOURCE_BUCKET);
    const { data: exists, error: existsError } = await bucket.exists(path);
    if (existsError) throw existsError;
    if (!exists) return;
    const { error } = await bucket.remove([path]);
    if (error) throw error;
  } catch (error) {
    throw new StorageDataError(`Could not delete the resource file: ${explainStorageError(error)}`, error);
  }
}

/** Removes a reported resource's private object after confirming admin status in the database. */
export async function deleteResourceFileForAdmin(path: string): Promise<void> {
  const safePath = validateStoragePath(path);
  const { client } = await requireCurrentUser();
  const { data: isAdmin, error: adminError } = await client.rpc('is_admin');
  if (adminError) throw new StorageDataError(`Could not verify administrator access: ${adminError.message}`, adminError);
  if (!isAdmin) throw new StorageDataError('Administrator access is required to remove this resource file.');
  try {
    const bucket = client.storage.from(RESOURCE_BUCKET);
    const { data: exists, error: existsError } = await bucket.exists(safePath);
    if (existsError) throw existsError;
    if (!exists) return;
    const { error } = await bucket.remove([safePath]);
    if (error) throw error;
  } catch (error) {
    throw new StorageDataError(`Could not delete the reported resource file: ${explainStorageError(error)}`, error);
  }
}
