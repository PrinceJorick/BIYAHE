import { CalendarClock, Check, ChevronDown, ChevronRight, CircleCheck, CircleHelp, ClipboardList, Clock, Copy, Ellipsis, Plus, Megaphone, Newspaper, Pencil, Send, TriangleAlert, Users, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { ACTIVE_CAMPUS } from '../campuses/active'
import { SPOT_CAPACITY_SOURCES } from '../campuses'
import { capacityTotals } from '../campuses/capacity'
import Badge from '../components/Badge'
import Dialog from '../components/Dialog'
import Lvl from '../components/Lvl'
import MapView from '../components/map/MapView'
import NewsArticleRow, { NewsCredit } from '../components/NewsArticleRow'
import StaffNav from '../components/StaffNav'
import { corridors, sampleNews, type Advisory, type Amenity, type CorridorStatus, type Severity } from '../data'
import {
  BODY_MAX, coordinatorGroups, endedAt, EXPIRY_HOURS, isCorridorScope, isManaged, phaseOf, reuseInput, scopeLabel, TITLE_MAX,
  validateAdvisoryInput, type AdvisoryInput, type InputErrors,
} from '../lib/advisories'
import { amenityLabel, clock, isFull, spacesLeft } from '../lib/derive'
import { disruptionNews, savedNewsUsable } from '../lib/news'
import { walkText } from '../lib/places'
import { routeLevel, routeStates, routeWord, type RouteStatus } from '../lib/routeStatus'
import {
  adjustOccupancy, canEditAmenities, canEditOccupancy, canManageAdvisories, createAdvisory, editAdvisory, getState, isOffline,
  marshalSpotId, publishDraft, resolveAdvisory, ROLE_TASKS, toggleAmenity, useApp, useNow,
} from '../lib/store'

const routeIcon: Record<RouteStatus, typeof Clock> = { open: CircleCheck, slow: Clock, closed: TriangleAlert, unknown: CircleHelp }
const routeImpact: Record<RouteStatus, string> = { open: '', slow: 'delayed', closed: 'stranded', unknown: 'unconfirmed' }
const fmt = (n: number) => n.toLocaleString('en-PH')

function since(t: number, now: number) {
  const sec = Math.max(0, Math.round((now - t) / 1000))
  return sec < 60 ? `${sec} s ago` : sec < 3600 ? `${Math.round(sec / 60)} min ago` : clock(t)
}

// The open dialog: create, edit, view one advisory, or resolve one.
type Open =
  // intent: which column's add button opened it (draft: save only; publish: publish only); absent = both
  | { kind: 'form'; editing: Advisory | null; template?: AdvisoryInput; intent?: 'draft' | 'publish' }
  | { kind: 'view'; id: string }
  | { kind: 'resolve'; advisory: Advisory }
  | { kind: 'pick-resolve' }
  | null

export default function Coordinator() {
  const s = useApp()
  const now = useNow(5000)
  const [open, setOpen] = useState<Open>(null)
  const offline = isOffline(s)
  const manage = canManageAdvisories(s)
  const states = routeStates(s.snapshot, corridors, now)
  const totals = capacityTotals(s.snapshot.spots)
  const viewing = open?.kind === 'view' ? s.snapshot.advisories.find((a) => a.id === open.id) ?? null : null
  const marshal = s.staffRole === 'Building Marshal'
  const mySpot = marshal ? marshalSpotId(s) : null
  const guard = s.staffRole === 'Guard on Duty'
  // A marshal's own building first; everyone else sees the registry order.
  const spots = mySpot ? [...s.snapshot.spots].sort((a, b) => Number(b.id === mySpot) - Number(a.id === mySpot)) : s.snapshot.spots

  return (
    <div className="coord">
      <StaffNav current="coordinator" />

      <main id="main" tabIndex={-1} className="coord-main">
        <header className="coord-head">
          <div className="page-head">
            <h1 className="h1">Coordinator Command</h1>
            <p className="cluster meta">
              <span className="strong">{ACTIVE_CAMPUS.shortName}</span>
              <a href="#/staff">Change<span className="sr-only"> campus</span></a>
              <span aria-hidden="true">·</span>
              <span>{s.staffRole}{mySpot ? ` · ${s.snapshot.spots.find((x) => x.id === mySpot)?.name ?? ''}` : ''}</span>
              <a href="#/settings">Change<span className="sr-only"> role</span></a>
            </p>
            <p className="cluster meta">
              <Badge kind={offline ? 'saved' : s.backend === 'device' ? 'simulated' : 'official'} />
              {offline ? `Offline · saved ${clock(s.savedAt)}` : `${s.backend === 'device' ? 'Demo data · ' : ''}synced ${since(s.savedAt, now)}`}
            </p>
          </div>
          {manage && (
            <button className="btn btn-primary" onClick={() => setOpen({ kind: 'form', editing: null })}>
              <Megaphone size={20} aria-hidden="true" />New advisory
            </button>
          )}
        </header>

        <section className="role-tasks" aria-labelledby="role-tasks">
          <h2 id="role-tasks" className="h3"><ClipboardList size={18} aria-hidden="true" /> Your tasks</h2>
          <ul>{ROLE_TASKS[s.staffRole].map((t) => <li key={t}><Check size={16} aria-hidden="true" />{t}</li>)}</ul>
        </section>

        <div className="coord-split">
          <section className="card" aria-labelledby="risk">
            <h2 id="risk" className="h2">Routes</h2>
            <div className="card-map"><MapView mode="staff" label="Route map. Each route's status is listed below." /></div>
            <ul className="list">
              {corridors.map((c) => {
                const st = states[c.id].status
                const Icon = routeIcon[st]
                return (
                  <li key={c.id}>
                    <div className="item">
                      <span className="item-icon"><Icon size={20} aria-hidden="true" /></span>
                      <span className="item-body">
                        <span className="item-title">{c.name}</span>
                        <span className="meta">{c.via} · <Lvl level={routeLevel[st]} className="strong">{routeWord[st]}</Lvl></span>
                        {st !== 'open' && <span className="caption clamp-2">{states[c.id].note}</span>}
                      </span>
                      <span className="item-end strong">{st === 'open' ? '—' : `~${c.commuters} ${routeImpact[st]}`}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
            <p className="caption">Counts are route selections, never individuals (RA 10173).</p>
          </section>

          <section className="card" aria-labelledby="shelters">
            <div className="card-head">
              <h2 id="shelters" className="h2">Safe spots</h2>
              <p className="meta cluster"><Users size={16} aria-hidden="true" />{fmt(totals.occupied)} waiting</p>
            </div>
            <dl className="totals">
              <div><dt className="caption">Capacity</dt><dd className="h2">{fmt(totals.capacity)}</dd></div>
              <div><dt className="caption">Spaces left</dt><dd className="h2">{fmt(totals.left)}</dd></div>
              <div><dt className="caption">Not assessed</dt><dd className="h2">{totals.unassessed} of {totals.spots}</dd></div>
            </dl>
            <ul className="list">
              {spots.map((x) => {
                const editCount = canEditOccupancy(s, x.id)
                const editAmenities = canEditAmenities(s, x.id)
                const left = spacesLeft(x)
                const full = isFull(x)
                const low = left != null && x.capacity != null && !full && left / x.capacity < 0.2
                const level = full ? 'high' : low ? 'mid' : x.capacity == null ? 'none' : 'low'
                const review = SPOT_CAPACITY_SOURCES[x.id]?.verified === false
                return (
                  <li key={x.id} className={`shelter${x.id === mySpot ? ' shelter-mine' : ''}`}>
                    <div className="between shelter-head">
                      <span className="item-body">
                        <h3 className="item-title">{x.name}{x.id === mySpot && <span className="tag">Your building</span>}</h3>
                        <span className="meta">{walkText(x.walkMin)}{review ? ' · capacity estimate needs review' : ''}</span>
                      </span>
                      <Lvl level={level} className="strong shelter-state">{full ? 'Full' : low ? 'Nearly full' : x.capacity == null ? 'Not assessed' : 'Has space'}</Lvl>
                    </div>
                    {x.capacity != null && <div className="meter" aria-hidden="true"><i style={{ width: `${Math.min(100, (x.occupied / x.capacity) * 100)}%` }} /></div>}
                    <div className="between wrap">
                      {editCount ? (
                        <div className="stepper" role="group" aria-label={`${x.name} headcount`}>
                          {guard && <button type="button" disabled={x.occupied <= 0} aria-label={`One person left ${x.name}`} onClick={() => adjustOccupancy(x.id, -1)}>−1</button>}
                          <button type="button" disabled={x.occupied <= 0} aria-label={`Remove 10 people from ${x.name}`} onClick={() => adjustOccupancy(x.id, -10)}>−10</button>
                          <output aria-live="polite" aria-label={x.capacity == null ? `${x.occupied} people in ${x.name}, capacity not assessed` : `${x.occupied} people in ${x.name}, capacity ${x.capacity}`}>
                            {fmt(x.occupied)}<span className="stepper-of"> of {x.capacity == null ? '—' : fmt(x.capacity)}</span>
                          </output>
                          <button type="button" disabled={full} aria-label={`Add 10 people to ${x.name}`} onClick={() => adjustOccupancy(x.id, 10)}>+10</button>
                          {guard && <button type="button" disabled={full} aria-label={`One person entered ${x.name}`} onClick={() => adjustOccupancy(x.id, 1)}>+1</button>}
                        </div>
                      ) : <p className="h3">{fmt(x.occupied)}<span className="stepper-of"> of {x.capacity == null ? '—' : fmt(x.capacity)}</span></p>}
                      <span className="meta">{left == null ? 'No capacity set' : `${fmt(left)} left`}</span>
                    </div>
                    {editAmenities ? (
                      <div className="chips" role="group" aria-label={`${x.name} amenities`}>
                        {(Object.keys(amenityLabel) as Amenity[]).map((a) => (
                          <button key={a} type="button" className="chip amenity" aria-pressed={x.amenities[a]} onClick={() => toggleAmenity(x.id, a)}>
                            {x.amenities[a] ? <Check size={16} aria-hidden="true" /> : <X size={16} aria-hidden="true" />}{amenityLabel[a]}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="meta amenity-list">{(Object.keys(amenityLabel) as Amenity[]).map((a) => (
                        <span key={a} className={x.amenities[a] ? '' : 'amenity-off'}>{x.amenities[a] ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}{amenityLabel[a]}<span className="sr-only">{x.amenities[a] ? ' available' : ' not available'}</span></span>
                      ))}</p>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        </div>

        <AdvisoryBoard now={now} manage={manage} onOpen={setOpen} />
        <NewsMonitor now={now} offline={offline} />
      </main>

      <Dialog open={open?.kind === 'form'} onClose={() => setOpen(null)}
        title={open?.kind !== 'form' ? '' : open.editing ? (open.editing.status === 'draft' ? 'Edit draft' : 'Edit active advisory') : open.intent === 'draft' ? 'New draft' : open.intent === 'publish' ? 'Publish advisory' : 'New advisory'}>
        {open?.kind === 'form' && <AdvisoryForm editing={open.editing} template={open.template} intent={open.intent} onDone={() => setOpen(null)} />}
      </Dialog>
      <Dialog open={open?.kind === 'pick-resolve'} onClose={() => setOpen(null)} title="Resolve which advisory?">
        {open?.kind === 'pick-resolve' && <PickResolve now={now} onOpen={setOpen} />}
      </Dialog>
      <Dialog open={open?.kind === 'view' && viewing !== null} onClose={() => setOpen(null)} title={viewing?.title ?? 'Advisory'}>
        {viewing && <AdvisoryDetails a={viewing} now={now} manage={manage} onOpen={setOpen} />}
      </Dialog>
      <Dialog open={open?.kind === 'resolve'} onClose={() => setOpen(null)} title={open?.kind === 'resolve' && open.advisory.status === 'draft' ? 'Discard draft?' : 'Resolve advisory?'}>
        {open?.kind === 'resolve' && <ResolveForm advisory={open.advisory} onDone={() => setOpen(null)} />}
      </Dialog>
    </div>
  )
}

// ── Local news monitor ───────────────────────────────────────────────────────
// Media reports for staff to check before issuing an advisory. Reading one never creates or changes an advisory.

function NewsMonitor({ now, offline }: { now: number; offline: boolean }) {
  const s = useApp()
  const usable = !offline || savedNewsUsable(s.news, now)
  const live = usable ? disruptionNews(s.news?.items ?? []).slice(0, 4) : []
  // No live report to show (none today, provider down or not configured): sample rows for the demo scenario, marked
  // Simulated. The warning above them stays.
  const samples = live.length ? [] : sampleNews(s.scenario === 'clear' ? 'clear' : 'disrupted', s.snapshot.updatedAt)
  const items = live.length ? live : samples
  return (
    <section className="card coord-news" aria-labelledby="news-monitor">
      <div className="card-head">
        <h2 id="news-monitor" className="h2"><Newspaper size={18} aria-hidden="true" /> Local news</h2>
        {offline && items.length > 0 && <Badge kind="saved" />}
      </div>
      <p className="meta">Third-party reports. Verify with the LGU or PAGASA before publishing.</p>
      {samples.length > 0 && (
        <p className="caption cluster"><Badge kind="simulated" />
          {s.news === null && !offline ? 'Loading live news. Showing samples.'
            : s.news?.provider === 'none' ? 'Live news not configured here. Showing samples.'
              : s.news?.error ? 'Live news unavailable. Showing samples.'
                : offline ? 'No saved live reports. Showing samples.' : 'No live reports right now. Showing samples.'}
        </p>
      )}
      <ul className="list">{items.map((n) => <li key={n.id}><NewsArticleRow item={n} now={now} offline={offline} savedAt={s.news?.fetchedAt ?? now} /></li>)}</ul>
      <NewsCredit />
    </section>
  )
}

// ── Advisory board ───────────────────────────────────────────────────────────
// Three columns, one per lifecycle stage: Drafts (students cannot see them) → Active (students see them) →
// Resolved (ended, withdrawn or expired; kept in the record). Every action goes through the store, so it is
// saved on this device, shared with open tabs and pushed to Supabase like any other change.

const sevView: Record<Severity, { level: 'none' | 'mid' | 'high'; label: string }> = {
  info: { level: 'none', label: 'Info' }, warning: { level: 'mid', label: 'Warning' }, critical: { level: 'high', label: 'Critical' },
}

function whenText(a: Advisory, now: number) {
  const phase = phaseOf(a, now)
  if (phase === 'draft') return `Created ${clock(a.issuedAt)}`
  const end = endedAt(a, now)
  if (phase === 'resolved') return `${a.withdrawn ? 'Discarded' : 'Resolved'} ${clock(end!)}`
  if (phase === 'expired') return `Expired ${clock(end!)}`
  return `Published ${clock(a.issuedAt)}${a.expiresAt ? ` · ends ${clock(a.expiresAt)}` : ''}`
}

type Action = { label: string; Icon: typeof Clock; run: () => void }

/** What the person in this role may do with an advisory now. Shared by the card menu and the details dialog. */
function actionsFor(a: Advisory, now: number, manage: boolean, onOpen: (o: Open) => void): Action[] {
  const phase = phaseOf(a, now)
  if (!manage || !isManaged(a)) return []
  const out: Action[] = []
  if (phase === 'draft' || phase === 'active') out.push({ label: 'Edit', Icon: Pencil, run: () => onOpen({ kind: 'form', editing: a }) })
  if (phase === 'draft') out.push({ label: 'Publish', Icon: Send, run: () => void publishDraft(a.id) })
  if (phase === 'active') out.push({ label: 'Resolve', Icon: CircleCheck, run: () => onOpen({ kind: 'resolve', advisory: a }) })
  if (phase === 'draft') out.push({ label: 'Discard', Icon: X, run: () => onOpen({ kind: 'resolve', advisory: a }) })
  if (phase === 'resolved' || phase === 'expired') out.push({ label: 'Reuse as draft', Icon: Copy, run: () => onOpen({ kind: 'form', editing: null, template: reuseInput(a), intent: 'draft' }) })
  return out
}

function CardActions({ a, now, manage, onOpen }: { a: Advisory; now: number; manage: boolean; onOpen: (o: Open) => void }) {
  const actions = actionsFor(a, now, manage, onOpen)
  if (!actions.length) return manage && !isManaged(a) && phaseOf(a, now) === 'active' ? <p className="caption">Managed by {a.source}</p> : null
  return (
    <div className="kcard-actions">
      {actions.map(({ label, Icon, run }) => <button key={label} type="button" className="btn btn-quiet btn-xs" onClick={run}><Icon size={16} aria-hidden="true" />{label}</button>)}
    </div>
  )
}

/** The card's "more" menu (Todoist's ···): a disclosure with the card's actions; closes on outside click or Escape. */
function CardMenu({ title, actions }: { title: string; actions: Action[] }) {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const close = (e: Event) => {
      const d = ref.current
      if (!d?.open) return
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !d.contains(e.target as Node)) {
        d.open = false
        if (e instanceof KeyboardEvent) d.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [])
  if (!actions.length) return null
  return (
    <details className="kmenu" ref={ref}>
      <summary className="kmenu-btn" aria-label={`Actions for ${title}`}><Ellipsis size={18} aria-hidden="true" /></summary>
      <div className="kmenu-list">
        {actions.map(({ label, Icon, run }) => (
          <button key={label} type="button" onClick={() => { if (ref.current) ref.current.open = false; run() }}><Icon size={16} aria-hidden="true" />{label}</button>
        ))}
      </div>
    </details>
  )
}

function AdvisoryCard({ a, now, manage, onOpen }: { a: Advisory; now: number; manage: boolean; onOpen: (o: Open) => void }) {
  const sv = sevView[a.severity]
  const phase = phaseOf(a, now)
  const actions = actionsFor(a, now, manage, onOpen)
  const resolve = phase === 'active' ? actions.find((x) => x.label === 'Resolve') : undefined
  const ended = phase === 'resolved' || phase === 'expired'
  // The circle, as in Todoist: coloured by severity; on an active advisory it is the Resolve button.
  const circle = <span className={`kcheck kcheck-${a.severity}${phase === 'draft' ? ' kcheck-draft' : ''}${ended ? ' kcheck-done' : ''}`} aria-hidden="true">{ended && <Check size={12} strokeWidth={3} />}</span>
  return (
    <article className="kcard">
      {resolve
        ? <button type="button" className="kcheck-btn" aria-label={`Resolve: ${a.title}`} onClick={resolve.run}>{circle}</button>
        : <span className="kcheck-btn">{circle}</span>}
      <div className="kcard-main">
        <h4 className="kcard-title"><button type="button" className="kcard-open clamp-2" onClick={() => onOpen({ kind: 'view', id: a.id })}>{a.title}</button></h4>
        {a.body && <p className="kcard-desc clamp-1">{a.body}</p>}
        <p className="kcard-meta">
          <span className={`kcard-when kcard-when-${phase}`}><CalendarClock size={14} aria-hidden="true" />{whenText(a, now)}</span>
          <Lvl level={sv.level} className="strong">{sv.label}</Lvl>
          <span className="clamp-1 kcard-scope">{scopeLabel(a.scope, corridors)}</span>
          {!isManaged(a) && <span>{a.source}</span>}
          {a.simulated && <Badge kind="simulated" />}
        </p>
      </div>
      <CardMenu title={a.title} actions={actions} />
    </article>
  )
}

function AdvisoryBoard({ now, manage, onOpen }: { now: number; manage: boolean; onOpen: (o: Open) => void }) {
  const s = useApp()
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const { drafts, active, ended } = coordinatorGroups(s.snapshot.advisories, now)
  const resolvable = active.filter((a) => isManaged(a))
  // Each column's own add button does that column's job: a new draft, a published advisory, or resolving one.
  const columns = [
    { id: 'drafts', title: 'Drafts', hint: 'Hidden from students', list: drafts, empty: 'No drafts.',
      add: { label: 'Add draft', run: () => onOpen({ kind: 'form', editing: null, intent: 'draft' }) } },
    { id: 'active', title: 'Active', hint: 'Students see these', list: active, empty: 'No active advisories. Students see none.',
      add: { label: 'Publish advisory', run: () => onOpen({ kind: 'form', editing: null, intent: 'publish' }) } },
    { id: 'resolved', title: 'Resolved', hint: 'Ended, discarded or expired', list: ended, empty: 'Nothing resolved yet.',
      add: resolvable.length ? { label: 'Resolve advisory', run: () => onOpen({ kind: 'pick-resolve' }) } : null },
  ]
  return (
    <section className="board-wrap" aria-labelledby="advisories">
      <div className="card-head">
        <h2 id="advisories" className="h2">Advisories</h2>
        {!manage && <p className="meta cluster"><TriangleAlert size={16} aria-hidden="true" />View only. The DRRMO Coordinator manages advisories.</p>}
      </div>
      <div className="board">
        {columns.map((c) => {
          const shut = closed[c.id]
          return (
            <section key={c.id} className={`kcol kcol-${c.id}`} aria-labelledby={`kcol-${c.id}`}>
              <header className="kcol-head">
                <h3 id={`kcol-${c.id}`} className="h3">
                  <button type="button" className="kcol-toggle" aria-expanded={!shut} aria-controls={`kcol-body-${c.id}`} onClick={() => setClosed({ ...closed, [c.id]: !shut })}>
                    <ChevronDown size={18} aria-hidden="true" className={shut ? 'is-shut' : undefined} />
                    {c.title} <span className="kcol-count">{c.list.length}</span>
                  </button>
                </h3>
                <p className="caption">{c.hint}</p>
              </header>
              <div id={`kcol-body-${c.id}`} className="kcol-body" hidden={shut}>
                {c.list.length === 0
                  ? <p className="kcol-empty meta">{c.empty}</p>
                  : <ul className="kcol-list">{c.list.map((a) => <li key={a.id}><AdvisoryCard a={a} now={now} manage={manage} onOpen={onOpen} /></li>)}</ul>}
                {manage && c.add && <button type="button" className="kcol-add" onClick={c.add.run}><Plus size={18} aria-hidden="true" />{c.add.label}</button>}
              </div>
            </section>
          )
        })}
      </div>
    </section>
  )
}

/** Resolved column → Resolve advisory: choose which active campus advisory to resolve. */
function PickResolve({ now, onOpen }: { now: number; onOpen: (o: Open) => void }) {
  const s = useApp()
  const list = coordinatorGroups(s.snapshot.advisories, now).active.filter((a) => isManaged(a))
  if (!list.length) return <p className="body">No active campus advisories to resolve.</p>
  return (
    <ul className="list">
      {list.map((a) => (
        <li key={a.id}>
          <button type="button" className="item" onClick={() => onOpen({ kind: 'resolve', advisory: a })}>
            <span className={`kcheck kcheck-${a.severity}`} aria-hidden="true" />
            <span className="item-body"><span className="item-title">{a.title}</span><span className="meta">{scopeLabel(a.scope, corridors)} · {whenText(a, now)}</span></span>
            <ChevronRight className="item-chev" size={18} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  )
}

function AdvisoryDetails({ a, now, manage, onOpen }: { a: Advisory; now: number; manage: boolean; onOpen: (o: Open) => void }) {
  const sv = sevView[a.severity]
  const phase = phaseOf(a, now)
  return (
    <div className="stack-lg">
      <p className="cluster meta">
        <Lvl level={sv.level} className="strong">{sv.label}</Lvl>
        <span>{phase === 'draft' ? 'Draft · hidden from students' : phase === 'active' ? 'Active · students see it' : a.withdrawn ? 'Discarded draft' : phase === 'expired' ? 'Expired' : 'Resolved'}</span>
        {a.simulated && <Badge kind="simulated" />}
      </p>
      {a.body ? <p className="body">{a.body}</p> : <p className="meta">No details.</p>}
      <dl className="diag-list">
        <div><dt>Audience</dt><dd>{scopeLabel(a.scope, corridors)}</dd></div>
        {a.corridorStatus && <div><dt>Route status</dt><dd>{routeWord[a.corridorStatus]}</dd></div>}
        <div><dt>Issued by</dt><dd>{a.issuer}</dd></div>
        <div><dt>Timeline</dt><dd>{whenText(a, now)}</dd></div>
      </dl>
      <CardActions a={a} now={now} manage={manage} onOpen={onOpen} />
    </div>
  )
}

// ── Create / edit form ───────────────────────────────────────────────────────

const severities: { id: Severity; label: string }[] = [
  { id: 'info', label: 'Info' },
  { id: 'warning', label: 'Warning' },
  { id: 'critical', label: 'Critical' },
]
const statuses: { id: CorridorStatus | 'keep'; label: string }[] = [
  { id: 'keep', label: 'No change' },
  { id: 'open', label: 'Clear' },
  { id: 'slow', label: 'Slow' },
  { id: 'closed', label: 'Closed' },
]
const expiryLabel = (h: number | null) => (h == null ? 'No end time' : `In ${h} hour${h === 1 ? '' : 's'}`)

function AdvisoryForm({ editing, template, intent, onDone }: { editing: Advisory | null; template?: AdvisoryInput; intent?: 'draft' | 'publish'; onDone: () => void }) {
  const id = useId()
  const start = editing ?? template
  const worst = corridors.find((c) => getState().snapshot.corridors[c.id]?.status === 'closed')
  const [scope, setScope] = useState(start?.scope ?? worst?.id ?? 'campus')
  const [sev, setSev] = useState<Severity>(start?.severity ?? 'warning')
  const [status, setStatus] = useState<CorridorStatus | 'keep'>(start?.corridorStatus ?? 'keep')
  const [title, setTitle] = useState(start?.title ?? '')
  const [body, setBody] = useState(start?.body ?? '')
  // 'keep' (edits only) keeps the current end time
  const [expiry, setExpiry] = useState<string>(editing ? 'keep' : 'none')
  const [errors, setErrors] = useState<InputErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const corridor = corridors.find((c) => c.id === scope)
  const reach = corridor ? corridor.commuters : corridors.reduce((n, c) => n + c.commuters, 0)
  const isDraft = !editing || editing.status === 'draft'

  const input = (): AdvisoryInput => ({
    scope, severity: sev, title, body,
    corridorStatus: corridor && status !== 'keep' ? status : null,
    expiresInHours: expiry === 'keep' ? undefined : expiry === 'none' ? null : Number(expiry),
  })
  const submit = (publish: boolean) => {
    const value = input()
    const found = validateAdvisoryInput(value, corridors)
    setErrors(found)
    setFormError(null)
    if (Object.keys(found).length) {
      document.getElementById(`${id}-${found.title ? 'title' : found.body ? 'body' : 'scope'}`)?.focus()
      return
    }
    let result = editing ? editAdvisory(editing.id, value) : createAdvisory(value, { publish })
    if (result.ok && editing && publish && isDraft) result = publishDraft(editing.id)
    if (!result.ok) {
      setErrors(result.errors ?? {})
      setFormError(result.error)
      return
    }
    onDone()
  }
  const err = (k: keyof InputErrors) => errors[k] && <p id={`${id}-${k}-err`} className="error"><TriangleAlert size={16} aria-hidden="true" />{errors[k]}</p>

  // Enter in a field never publishes: for a draft it saves the draft; only the Publish button publishes.
  // Opened from the Active column (intent 'publish'), Enter does nothing; the Publish button is the only way.
  return (
    <form className="stack-lg" noValidate onSubmit={(e) => { e.preventDefault(); if (intent !== 'publish') submit(false) }}>
      {editing && !isDraft && (
        <p className="banner">
          <TriangleAlert size={20} aria-hidden="true" />
          <span>Live advisory. Saving updates what students see now.</span>
        </p>
      )}
      <div className="field">
        <label htmlFor={`${id}-scope`}>Audience</label>
        <select id={`${id}-scope`} className="input" value={scope} onChange={(e) => { setScope(e.target.value); if (!isCorridorScope(e.target.value)) setStatus('keep') }}>
          <option value="campus">Whole campus</option>
          <option value="all">All routes</option>
          {corridors.map((c) => <option key={c.id} value={c.id}>{c.name} route ({c.via})</option>)}
        </select>
        {err('scope')}
      </div>

      <div className="field" role="group" aria-labelledby={`${id}-sev`}>
        <span id={`${id}-sev`} className="field-label">Severity</span>
        <div className="chips">
          {severities.map((x) => <button key={x.id} type="button" className="chip" aria-pressed={sev === x.id} onClick={() => setSev(x.id)}>{x.label}</button>)}
        </div>
        {err('severity')}
      </div>

      {corridor && (
        <div className="field" role="group" aria-labelledby={`${id}-st`}>
          <span id={`${id}-st`} className="field-label">Set {corridor.via} to</span>
          <div className="chips">
            {statuses.map((x) => <button key={x.id} type="button" className="chip" aria-pressed={status === x.id} onClick={() => setStatus(x.id)}>{x.label}</button>)}
          </div>
          <p className="meta">Applies on publish. Closed tells this route's students to wait on campus.</p>
          {err('corridorStatus')}
        </div>
      )}

      <div className="field">
        <label htmlFor={`${id}-title`}>Headline</label>
        <input id={`${id}-title`} className="input" value={title} maxLength={TITLE_MAX} autoComplete="off" placeholder="Flooding near Balagtas"
          aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? `${id}-title-err` : undefined}
          onChange={(e) => setTitle(e.target.value)} />
        {err('title')}
      </div>

      <div className="field">
        <label htmlFor={`${id}-body`}>Details (optional)</label>
        <textarea id={`${id}-body`} className="input" value={body} maxLength={BODY_MAX} aria-invalid={Boolean(errors.body)}
          aria-describedby={errors.body ? `${id}-body-err` : undefined} onChange={(e) => setBody(e.target.value)} />
        {err('body')}
      </div>

      <div className="field">
        <label htmlFor={`${id}-end`}>Ends</label>
        <select id={`${id}-end`} className="input" value={expiry} onChange={(e) => setExpiry(e.target.value)}>
          {editing && <option value="keep">{editing.expiresAt ? `Keep (${clock(editing.expiresAt)})` : 'Keep: no end time'}</option>}
          {EXPIRY_HOURS.map((h) => <option key={String(h)} value={h == null ? 'none' : String(h)}>{expiryLabel(h)}</option>)}
        </select>
        {err('expiresInHours')}
      </div>

      <p className="meta">
        <Users className="inline-icon" size={16} aria-hidden="true" />
        Reaches about {reach} students{corridor ? ` on the ${corridor.name} route` : ''}.
      </p>
      {formError && <p className="error" role="alert"><TriangleAlert size={16} aria-hidden="true" />{formError}</p>}

      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onDone}>Cancel</button>
        {isDraft ? (
          <>
            {intent !== 'publish' && <button type="submit" className={`btn ${intent === 'draft' ? 'btn-primary' : 'btn-secondary'}`}>Save draft</button>}
            {intent !== 'draft' && <button type="button" className="btn btn-primary" onClick={() => submit(true)}><Send size={18} aria-hidden="true" />Publish</button>}
          </>
        ) : <button type="submit" className="btn btn-primary">Save changes</button>}
      </div>
    </form>
  )
}

// ── Resolve / discard ────────────────────────────────────────────────────────

function ResolveForm({ advisory, onDone }: { advisory: Advisory; onDone: () => void }) {
  const s = useApp()
  const corridor = isCorridorScope(advisory.scope) ? corridors.find((c) => c.id === advisory.scope) : undefined
  const corridorNotOpen = Boolean(corridor && s.snapshot.corridors[corridor.id]?.status !== 'open')
  const [reopen, setReopen] = useState(false)
  const draft = advisory.status === 'draft'
  return (
    <form className="stack-lg" onSubmit={(e) => {
      e.preventDefault()
      if (resolveAdvisory(advisory.id, { reopenCorridor: reopen }).ok) onDone()
    }}>
      <p className="body"><strong>{advisory.title}</strong></p>
      <p className="body">{draft ? 'Students never saw this draft. It moves to Resolved.' : 'Students stop seeing it. It moves to Resolved and stays on record.'}</p>
      {!draft && corridor && corridorNotOpen && (
        <label className="cluster">
          <input type="checkbox" checked={reopen} onChange={(e) => setReopen(e.target.checked)} />
          <span>Also mark {corridor.via} clear</span>
        </label>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn btn-primary">{draft ? 'Discard draft' : 'Resolve'}</button>
      </div>
    </form>
  )
}
