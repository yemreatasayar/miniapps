import { CURRENT_DRAFT_ID, STORAGE_DB_NAME, STORAGE_STORE_NAME } from "./constants";
import { BulletinDocument, StoredDocument } from "./types";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STORAGE_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORAGE_STORE_NAME)) {
        db.createObjectStore(STORAGE_STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB acilamadi."));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => Promise<T> | T
): Promise<T> {
  const db = await openDatabase();

  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORAGE_STORE_NAME, mode);
    const store = transaction.objectStore(STORAGE_STORE_NAME);

    Promise.resolve(handler(store))
      .then((value) => {
        transaction.oncomplete = () => {
          db.close();
          resolve(value);
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error ?? new Error("IndexedDB islemi basarisiz oldu."));
        };
      })
      .catch((error) => {
        db.close();
        reject(error);
      });
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB istegi basarisiz oldu."));
  });
}

export async function saveDraft(document: BulletinDocument): Promise<void> {
  const record: StoredDocument = {
    id: CURRENT_DRAFT_ID,
    kind: "draft",
    createdAt: document.createdAt,
    updatedAt: new Date().toISOString(),
    document,
  };

  await withStore("readwrite", async (store) => {
    await requestToPromise(store.put(record));
  });
}

export async function loadDraft(): Promise<BulletinDocument | null> {
  return withStore("readonly", async (store) => {
    const record = await requestToPromise(store.get(CURRENT_DRAFT_ID));
    return (record as StoredDocument | undefined)?.document ?? null;
  });
}

export async function saveHistoryDocument(document: BulletinDocument, explicitId?: string): Promise<string> {
  const id = explicitId || crypto.randomUUID();
  const now = new Date().toISOString();
  const record: StoredDocument = {
    id,
    kind: "saved",
    createdAt: document.createdAt || now,
    updatedAt: now,
    document: {
      ...document,
      id,
      updatedAt: now,
    },
  };

  await withStore("readwrite", async (store) => {
    await requestToPromise(store.put(record));
  });

  return id;
}

export async function listHistoryDocuments(): Promise<StoredDocument[]> {
  return withStore("readonly", async (store) => {
    const records = (await requestToPromise(store.getAll())) as StoredDocument[];
    return records
      .filter((record) => record.kind === "saved")
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  });
}

export async function loadHistoryDocument(id: string): Promise<StoredDocument | null> {
  return withStore("readonly", async (store) => {
    const record = (await requestToPromise(store.get(id))) as StoredDocument | undefined;
    return record ?? null;
  });
}

export async function deleteHistoryDocument(id: string): Promise<void> {
  await withStore("readwrite", async (store) => {
    await requestToPromise(store.delete(id));
  });
}
