import type { SupabaseClient } from '@supabase/supabase-js'
import { corridors, type Advisory, type CorridorState, type Snapshot, type Spot } from '../data'

// Live backend. Configured through VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (see .env.example
// and supabase/schema.sql). Every call resolves to null/false instead of throwing so the store
// can fall back to the on-device snapshot.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configured = Boolean(url && key)

let clientp: Promise<SupabaseClient> | null = null

// The client is loaded on demand so the unconfigured demo build never downloads it.
function client(): Promise<SupabaseClient> {
  clientp ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(url!, key!, { auth: { persistSession: false } }),
  )
  return clientp
}

const ms = (iso: string) => new Date(iso).getTime()
const iso = (t: number) => new Date(t).toISOString()

const spotRow = (s: Spot) => ({
  id: s.id, name: s.name, walk_min: s.walkMin, capacity: s.capacity, occupied: s.occupied,
  power: s.amenities.power, water: s.amenities.water, food: s.amenities.food,
  geom: `SRID=4326;POINT(${s.pos[1]} ${s.pos[0]})`, updated_at: iso(Date.now()),
})

const corridorRow = (id: string, c: CorridorState) => ({
  corridor_id: id, status: c.status, min_lo: c.minLo, min_hi: c.minHi, note: c.note,
  source: c.source, provenance: c.provenance, updated_at: iso(Date.now()),
})

// Advisory lifecycle (draft / published / resolved, edit and end times, corridor status) is stored in the
// existing `payload` jsonb column under `lifecycle`, so supabase/schema.sql needs no new columns.
type AdvisoryLifecycle = Pick<Advisory, 'status' | 'updatedAt' | 'expiresAt' | 'resolvedAt' | 'corridorStatus'>
const LIFECYCLE_KEYS = ['status', 'updatedAt', 'expiresAt', 'resolvedAt', 'corridorStatus'] as const

export function advisoryRow(a: Advisory) {
  const lifecycle: AdvisoryLifecycle = {}
  for (const k of LIFECYCLE_KEYS) if (a[k] !== undefined) (lifecycle as Record<string, unknown>)[k] = a[k]
  return {
    id: a.id, source: a.source, issuer: a.issuer, title: a.title, body: a.body,
    severity: a.severity, scope: a.scope, issued_at: iso(a.issuedAt),
    payload: Object.keys(lifecycle).length ? { lifecycle } : null,
  }
}

export type AdvisoryDbRow = {
  id: string; source: Advisory['source']; issuer: string; title: string; body: string | null
  severity: Advisory['severity']; scope: string; issued_at: string; payload?: { lifecycle?: Partial<Record<string, unknown>> } | null
}

const STATUSES = ['draft', 'published', 'resolved']
const CORRIDOR_STATUSES = ['open', 'slow', 'closed']
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

// Unknown or malformed lifecycle values are dropped, so a bad row reads as a plain published advisory
// rather than breaking the student view.
export function advisoryFromRow(r: AdvisoryDbRow): Advisory {
  const l = r.payload?.lifecycle ?? {}
  const a: Advisory = { id: r.id, source: r.source, issuer: r.issuer, title: r.title, body: r.body ?? '', severity: r.severity, scope: r.scope, issuedAt: ms(r.issued_at) }
  if (typeof l.status === 'string' && STATUSES.includes(l.status)) a.status = l.status as Advisory['status']
  if (num(l.updatedAt) !== undefined) a.updatedAt = num(l.updatedAt)
  if (num(l.expiresAt) !== undefined) a.expiresAt = num(l.expiresAt)
  if (num(l.resolvedAt) !== undefined) a.resolvedAt = num(l.resolvedAt)
  if (typeof l.corridorStatus === 'string' && CORRIDOR_STATUSES.includes(l.corridorStatus)) a.corridorStatus = l.corridorStatus as Advisory['corridorStatus']
  return a
}

// Returns null when unreachable, 'empty' when the tables have not been seeded yet.
export async function fetchSnapshot(): Promise<Snapshot | 'empty' | null> {
  if (!configured) return null
  try {
    const db = await client()
    const [cs, sp, ad] = await Promise.all([
      db.from('corridor_status').select('*'),
      db.from('safe_spots_view').select('*').order('walk_min'),
      db.from('advisories').select('*').order('issued_at', { ascending: false }).limit(50),
    ])
    if (cs.error || sp.error || ad.error) throw cs.error ?? sp.error ?? ad.error
    if (!cs.data.length || !sp.data.length) return 'empty'
    let updatedAt = 0
    const states: Record<string, CorridorState> = {}
    for (const r of cs.data) {
      if (!corridors.some((c) => c.id === r.corridor_id)) continue
      states[r.corridor_id] = { status: r.status, minLo: r.min_lo, minHi: r.min_hi, note: r.note ?? '', source: r.source ?? '', provenance: r.provenance }
      updatedAt = Math.max(updatedAt, ms(r.updated_at))
    }
    const spots: Spot[] = sp.data.map((r) => {
      updatedAt = Math.max(updatedAt, ms(r.updated_at))
      return { id: r.id, name: r.name, walkMin: r.walk_min, capacity: r.capacity, occupied: r.occupied,
        amenities: { power: r.power, water: r.water, food: r.food }, pos: [r.lat, r.lon] }
    })
    const advisories: Advisory[] = ad.data.map((r: AdvisoryDbRow) => {
      const a = advisoryFromRow(r)
      updatedAt = Math.max(updatedAt, a.issuedAt, a.updatedAt ?? 0)
      return a
    })
    return { corridors: states, spots, advisories, updatedAt }
  } catch (e) {
    console.warn('[biyahe] Supabase unreachable, using saved copy', e)
    return null
  }
}

export async function subscribe(onChange: () => void): Promise<() => void> {
  if (!configured) return () => {}
  try {
    const db = await client()
    const channel = db.channel('biyahe-live')
    for (const table of ['corridor_status', 'safe_spots', 'advisories']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
    }
    channel.subscribe()
    return () => void db.removeChannel(channel)
  } catch {
    return () => {}
  }
}

async function write(run: (db: SupabaseClient) => PromiseLike<{ error: unknown }>): Promise<boolean> {
  if (!configured) return false
  try {
    const { error } = await run(await client())
    if (error) throw error
    return true
  } catch (e) {
    console.warn('[biyahe] Supabase write failed, kept on this device', e)
    return false
  }
}

export const pushSpot = (s: Spot) => write((db) => db.from('safe_spots').upsert(spotRow(s)))
export const pushCorridor = (id: string, c: CorridorState) => write((db) => db.from('corridor_status').upsert(corridorRow(id, c)))
export const pushAdvisory = (a: Advisory) => write((db) => db.from('advisories').upsert(advisoryRow(a)))

// Replaces the whole shared state. Used to seed an empty project and by the demo scenario switcher.
export async function pushAll(s: Snapshot): Promise<boolean> {
  const ok = await Promise.all([
    write((db) => db.from('corridor_status').upsert(Object.entries(s.corridors).map(([id, c]) => corridorRow(id, c)))),
    write((db) => db.from('safe_spots').upsert(s.spots.map(spotRow))),
    write((db) => db.from('advisories').delete().not('id', 'in', `(${s.advisories.map((a) => `"${a.id}"`).join(',') || '""'})`)),
  ])
  if (s.advisories.length) ok.push(await write((db) => db.from('advisories').upsert(s.advisories.map(advisoryRow))))
  return ok.every(Boolean)
}
