import type { StorageBackend, StorageOperation } from '../core/store.ts';

const STORE = 'kv';

/**
 * IndexedDB-backed storage. Data lives in this site's private storage on the phone and nowhere else.
 * One readwrite transaction per commit gives the all-or-nothing behaviour the store relies on.
 */
export class IndexedDbBackend implements StorageBackend {
  private readonly name: string;
  private opening: Promise<IDBDatabase> | null = null;

  constructor(name: string) {
    this.name = name;
  }

  static isAvailable(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  private open(): Promise<IDBDatabase> {
    if (!this.opening) {
      this.opening = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(this.name, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
        };
        request.onsuccess = () => {
          const db = request.result;
          // If the browser closes the connection under us, reopen on the next call.
          db.onclose = () => {
            this.opening = null;
          };
          db.onversionchange = () => {
            db.close();
            this.opening = null;
          };
          resolve(db);
        };
        request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened'));
        request.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
      });
      this.opening.catch(() => {
        this.opening = null;
      });
    }
    return this.opening;
  }

  async read(key: string): Promise<unknown> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB read aborted'));
    });
  }

  async commit(operations: StorageOperation[]): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      // 'strict' asks the browser to flush to disk before reporting completion.
      const transaction = db.transaction(STORE, 'readwrite', { durability: 'strict' });
      const store = transaction.objectStore(STORE);
      // Resolve only once the whole transaction has committed, never on the individual requests.
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB write failed'));
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB write aborted'));
      try {
        for (const operation of operations) {
          if (operation.type === 'put') store.put(operation.value, operation.key);
          else store.delete(operation.key);
        }
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    });
  }
}

/** Asks the browser not to evict our data under storage pressure. Best effort; the answer is not relied on. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
