// Minimal IndexedDB key-value store for the offline snapshot. Falls back to memory
// when IndexedDB is unavailable (private windows, blocked storage).

const DB = 'biyahe'
const STORE = 'kv'
const memory = new Map<string, unknown>()

let dbp: Promise<IDBDatabase | null> | null = null

function open(): Promise<IDBDatabase | null> {
  dbp ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbp
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await open()
  if (!db) return memory.get(key) as T | undefined
  return new Promise((resolve) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => resolve(undefined)
  })
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await open()
  if (!db) {
    memory.set(key, value)
    return
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
    tx.onabort = () => resolve()
  })
}
