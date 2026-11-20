// Minimal IndexedDB key-value store for the offline snapshot. Falls back to memory
// when IndexedDB is unavailable (private windows, blocked storage).
//
// Versions (never delete the database to migrate; every step is targeted):
//   1  'kv' store: snapshot:<campus> ({ snapshot, savedAt }), weather:<campus>
//   2  Iteration 3: renames legacy safe-spot IDs/names inside saved snapshots (src/lib/spotData.ts) and adds a
//      'routes' store for cached walking routes. Weather and everything else in 'kv' are left untouched.
//      Corrected coordinates are applied on load by reconcileSpots(), so no coordinate is rewritten here.
import { migrateSnapshotRecord } from './spotData'

const DB = 'biyahe'
export const DB_VERSION = 2
const STORE = 'kv'
export const ROUTES = 'routes'
type StoreName = typeof STORE | typeof ROUTES
const memory = new Map<string, unknown>()
// If another open tab (an older version without a versionchange handler) holds the database, the upgrade is
// blocked. Wait this long for it, then carry on in memory for this visit rather than hang or reload.
const BLOCKED_WAIT_MS = 3000

let dbp: Promise<IDBDatabase | null> | null = null

/** The upgrade steps, separate from open() so they can be tested against a fake transaction. */
export function upgrade(db: IDBDatabase, tx: IDBTransaction, oldVersion: number) {
  if (oldVersion < 1) db.createObjectStore(STORE)
  if (oldVersion < 2) {
    if (!db.objectStoreNames.contains(ROUTES)) db.createObjectStore(ROUTES)
    if (oldVersion >= 1) {
      const cursor = tx.objectStore(STORE).openCursor()
      cursor.onsuccess = () => {
        const c = cursor.result
        if (!c) return
        if (typeof c.key === 'string' && c.key.startsWith('snapshot:')) {
          try {
            c.update(migrateSnapshotRecord(c.value))
          } catch {
            // Leave a record that cannot be migrated as it is; reconcileSpots() still corrects it on load.
          }
        }
        c.continue()
      }
    }
  }
}

function open(): Promise<IDBDatabase | null> {
  dbp ??= new Promise((resolve) => {
    let settled = false
    const done = (db: IDBDatabase | null) => {
      if (settled) {
        db?.close()
        return
      }
      settled = true
      resolve(db)
    }
    try {
      const req = indexedDB.open(DB, DB_VERSION)
      req.onupgradeneeded = (e) => upgrade(req.result, req.transaction!, e.oldVersion)
      req.onsuccess = () => {
        const db = req.result
        // A newer version opened in another tab: step aside so its upgrade is never blocked by this one.
        db.onversionchange = () => {
          db.close()
          dbp = null
        }
        done(db)
      }
      req.onerror = () => done(null)
      req.onblocked = () => setTimeout(() => done(null), BLOCKED_WAIT_MS)
    } catch {
      done(null)
    }
  })
  return dbp
}

const memKey = (store: StoreName, key: string) => (store === STORE ? key : `${store}/${key}`)

export async function idbGet<T>(key: string, store: StoreName = STORE): Promise<T | undefined> {
  const db = await open()
  if (!db) return memory.get(memKey(store, key)) as T | undefined
  return new Promise((resolve) => {
    try {
      const req = db.transaction(store, 'readonly').objectStore(store).get(key)
      req.onsuccess = () => resolve(req.result as T | undefined)
      req.onerror = () => resolve(undefined)
    } catch {
      resolve(memory.get(memKey(store, key)) as T | undefined)
    }
  })
}

export async function idbSet(key: string, value: unknown, store: StoreName = STORE): Promise<void> {
  const db = await open()
  if (!db) {
    memory.set(memKey(store, key), value)
    return
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      memory.set(memKey(store, key), value)
      resolve()
    }
  })
}

export async function idbDelete(key: string, store: StoreName = STORE): Promise<void> {
  memory.delete(memKey(store, key))
  const db = await open()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
}

/** Empties BIYAHE's own stores (this database only; nothing else on the device is touched). */
export async function idbClearAll(): Promise<void> {
  memory.clear()
  const db = await open()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE, ROUTES], 'readwrite')
      tx.objectStore(STORE).clear()
      tx.objectStore(ROUTES).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
}
