/** Local IndexedDB storage for uploaded file data. */
export interface StoredFile {
  id: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
}

const DB_NAME = 'CampusFlowDB';
const STORE_NAME = 'files';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser does not support local file storage.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local file storage.'));
    request.onblocked = () => reject(new Error('Local file storage is busy in another tab.'));
  });
}

async function runRequest<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown, result?: T) => {
      if (settled) return;
      settled = true;
      db.close();
      if (error) reject(error);
      else resolve(result as T);
    };
    try {
      const tx = db.transaction(STORE_NAME, mode);
      const request = operation(tx.objectStore(STORE_NAME));
      request.onsuccess = () => finish(undefined, request.result);
      request.onerror = () => finish(request.error ?? new Error('Local file operation failed.'));
      tx.onerror = () => finish(tx.error ?? new Error('Local file operation failed.'));
      tx.onabort = () => finish(tx.error ?? new Error('Local file operation was cancelled.'));
    } catch (error) {
      finish(error);
    }
  });
}

export async function saveFile(file: File): Promise<string> {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const stored: StoredFile = { id, name: file.name, type: file.type, size: file.size, blob: file };
  await runRequest<IDBValidKey>('readwrite', (store) => store.add(stored));
  return id;
}

export async function getFile(fileId: string): Promise<StoredFile | null> {
  return (await runRequest<StoredFile | undefined>('readonly', (store) => store.get(fileId))) ?? null;
}

export async function deleteFile(fileId: string): Promise<void> {
  await runRequest<undefined>('readwrite', (store) => store.delete(fileId));
}

export async function fileExists(fileId: string): Promise<boolean> {
  return (await runRequest<IDBValidKey | undefined>('readonly', (store) => store.getKey(fileId))) !== undefined;
}
