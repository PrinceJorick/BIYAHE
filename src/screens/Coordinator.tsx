import { Check, CircleCheck, Clock, LayoutDashboard, LogOut, Megaphone, Pencil, Send, Smartphone, TriangleAlert, Users, X } from 'lucide-react'
import { useId, useState } from 'react'
import Badge from '../components/Badge'
import CorridorMap from '../components/CorridorMap'
import Dialog from '../components/Dialog'
import Logo, { LogoMark } from '../components/Logo'
import { corridors, type Advisory, type Amenity, type CorridorStatus, type Severity } from '../data'
import {
  BODY_MAX, coordinatorGroups, endedAt, EXPIRY_HOURS, isCorridorScope, isManaged, phaseOf, scopeLabel, TITLE_MAX,
  validateAdvisoryInput, type AdvisoryInput, type AdvisoryPhase, type InputErrors,
} from '../lib/advisories'
import { amenityLabel, clock, spacesLeft } from '../lib/derive'
import { useMedia } from '../lib/router'
import {
  adjustOccupancy, canManageAdvisories, chooseRole, createAdvisory, editAdvisory, getState, isOffline, publishDraft,
  resolveAdvisory, toggleAmenity, useApp, useNow,
} from '../lib/store'

const statusView: Record<CorridorStatus, { tone: string; Icon: typeof Clock; label: string; unit: string }> = {
  open: { tone: 'ok', Icon: CircleCheck, label: 'Clear', unit: 'affected' },
  slow: { tone: 'warn', Icon: Clock, label: 'Slow', unit: 'delayed' },
  closed: { tone: 'danger', Icon: TriangleAlert, label: 'Closed', unit: 'stranded' },
}

function since(t: number, now: number) {
  const sec = Math.max(0, Math.round((now - t) / 1000))
  return sec < 60 ? `${sec} s ago` : sec < 3600 ? `${Math.round(sec / 60)} min ago` : clock(t)
}

export default function Coordinator() {
  const s = useApp()
  const now = useNow(5000)
  const wide = useMedia('(min-width: 900px)')
  // null = closed; 'new' = create; otherwise the advisory being edited
  const [editing, setEditing] = useState<'new' | Advisory | null>(null)
  const [resolving, setResolving] = useState<Advisory | null>(null)
  const offline = isOffline(s)
  const manage = canManageAdvisories(s)
  const waiting = s.snapshot.spots.reduce((n, x) => n + x.occupied, 0)

  return (
    <div className="coord">
      <nav className="coord-nav" aria-label="Staff">
        {wide ? <Logo size={32} onDark /> : <LogoMark size={36} />}
        <ul>
          <li><a className="tab" href="#/coordinator" aria-current="page"><LayoutDashboard size={20} aria-hidden="true" /><span>Command</span></a></li>
          <li><a className="tab" href="#/home" onClick={() => chooseRole('student')}><Smartphone size={20} aria-hidden="true" /><span>Student view</span></a></li>
          <li><a className="tab" href="#/welcome" onClick={() => chooseRole(null)}><LogOut size={20} aria-hidden="true" /><span>Switch role</span></a></li>
        </ul>
      </nav>

      <main id="main" tabIndex={-1} className="coord-main">
        <header className="coord-head">
          <div className="stack" style={{ gap: 6 }}>
            <h1 className="h1">Coordinator Command</h1>
            <p className="cluster meta">
              <Badge kind={offline ? 'saved' : 'official'} />
              {offline
                ? `Offline. Changes are saved on this device (${clock(s.savedAt)}).`
                : `Live · synced ${since(s.savedAt, now)} · student views update instantly`}
            </p>
          </div>
          {manage && (
            <button className="btn btn-danger" onClick={() => setEditing('new')}>
              <Megaphone size={20} aria-hidden="true" />Publish Campus / Corridor Advisory
            </button>
          )}
        </header>

        <div className="coord-split">
          <section className="section" aria-labelledby="risk">
            <h2 id="risk" className="h2">Corridor risk</h2>
            <CorridorMap mode="staff" />
            <ul className="rows">
              {corridors.map((c) => {
                const st = s.snapshot.corridors[c.id].status
                const sv = statusView[st]
                return (
                  <li key={c.id}>
                    <div className={`row tone-${sv.tone}`}>
                      <sv.Icon className="row-icon" size={22} aria-hidden="true" />
                      <span className="row-body">
                        <span className="row-title">{c.name}</span>
                        <span className="meta">via {c.via}</span>
                        <span className="tag">{sv.label}</span>
                      </span>
                      <span className="strong" style={{ textAlign: 'right' }}>{st === 'open' ? '0 affected' : `about ${c.commuters} ${sv.unit}`}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
            <p className="meta">Estimates come from corridor selections only. Aggregated, never per student (RA 10173).</p>
          </section>

          <section className="section" aria-labelledby="shelters">
            <div className="between">
              <h2 id="shelters" className="h2">Safe spots</h2>
              <p className="tag"><Users size={18} aria-hidden="true" />{waiting} waiting on campus</p>
            </div>
            <ul className="rows">
              {s.snapshot.spots.map((x) => {
                const left = spacesLeft(x)
                const tone = left <= 0 ? 'danger' : left / x.capacity < 0.2 ? 'warn' : 'ok'
                return (
                  <li key={x.id} className={`shelter tone-${tone}`}>
                    <div className="between">
                      <h3 className="row-title">{x.name}</h3>
                      <span className="tag">{left <= 0 ? 'Full' : left / x.capacity < 0.2 ? 'Nearly full' : 'Has space'}</span>
                    </div>
                    <div className="meter" aria-hidden="true"><i style={{ width: `${(x.occupied / x.capacity) * 100}%` }} /></div>
                    <div className="between" style={{ flexWrap: 'wrap' }}>
                      <div className="stepper" role="group" aria-label={`${x.name} occupancy`}>
                        <button type="button" disabled={x.occupied <= 0} aria-label={`Remove 10 people from ${x.name}`} onClick={() => adjustOccupancy(x.id, -10)}>−10</button>
                        <output aria-live="polite" aria-label={`${x.occupied} of ${x.capacity} in ${x.name}`}>{x.occupied} / {x.capacity}</output>
                        <button type="button" disabled={left <= 0} aria-label={`Add 10 people to ${x.name}`} onClick={() => adjustOccupancy(x.id, 10)}>+10</button>
                      </div>
                      <span className="meta">{left} spaces left</span>
                    </div>
                    <div className="chips" role="group" aria-label={`${x.name} amenities`}>
                      {(Object.keys(amenityLabel) as Amenity[]).map((a) => (
                        <button key={a} type="button" className="chip amenity" aria-pressed={x.amenities[a]} onClick={() => toggleAmenity(x.id, a)}>
                          {x.amenities[a] ? <Check size={16} aria-hidden="true" /> : <X size={16} aria-hidden="true" />}{amenityLabel[a]}
                        </button>
                      ))}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>

        <AdvisoryList now={now} manage={manage} onEdit={setEditing} onResolve={setResolving} />
      </main>

      <Dialog open={editing !== null} onClose={() => setEditing(null)}
        title={editing === 'new' || editing === null ? 'New advisory' : editing.status === 'draft' ? 'Edit draft' : 'Edit published advisory'}>
        {editing !== null && <AdvisoryForm editing={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
      <Dialog open={resolving !== null} onClose={() => setResolving(null)} title={resolving?.status === 'draft' ? 'Withdraw draft' : 'Resolve advisory'}>
        {resolving && <ResolveForm advisory={resolving} onDone={() => setResolving(null)} />}
      </Dialog>
    </div>
  )
}

// ── Advisory list ────────────────────────────────────────────────────────────

const phaseView: Record<AdvisoryPhase, { label: string; tone: string }> = {
  draft: { label: 'Draft · not visible to students', tone: 'saved' },
  active: { label: 'Published · active', tone: 'ok' },
  resolved: { label: 'Resolved', tone: 'saved' },
  expired: { label: 'Expired', tone: 'saved' },
}

function AdvisoryList({ now, manage, onEdit, onResolve }: {
  now: number; manage: boolean; onEdit: (a: Advisory) => void; onResolve: (a: Advisory) => void
}) {
  const s = useApp()
  const { drafts, active, ended } = coordinatorGroups(s.snapshot.advisories, now)
  const group = (title: string, id: string, list: Advisory[], empty: string) => (
    <section className="section" aria-labelledby={id}>
      <h3 id={id} className="h2">{title} <span className="meta">({list.length})</span></h3>
      {list.length === 0 ? <p className="meta">{empty}</p> : (
        <ul className="rows">
          {list.map((a) => {
            const phase = phaseOf(a, now)
            const pv = phaseView[phase]
            const end = endedAt(a, now)
            const editable = manage && isManaged(a) && (phase === 'draft' || phase === 'active')
            return (
              <li key={a.id}>
                <article className={`row tone-${pv.tone}`} style={{ alignItems: 'flex-start' }}>
                  <div className="row-body" style={{ gap: 6 }}>
                    <span className="tag">{pv.label}</span>
                    <h4 className="row-title">{a.title}</h4>
                    <p className="meta">{scopeLabel(a.scope, corridors)} · {a.severity} · {a.issuer}</p>
                    <p className="meta">
                      {phase === 'draft' ? `Created ${clock(a.issuedAt)}` : `Published ${clock(a.issuedAt)}`}
                      {a.updatedAt && a.updatedAt !== a.issuedAt && phase !== 'resolved' ? ` · updated ${clock(a.updatedAt)}` : ''}
                      {end != null ? ` · ended ${clock(end)}` : a.expiresAt ? ` · ends ${clock(a.expiresAt)}` : ''}
                    </p>
                    {!isManaged(a) && <p className="meta">Issued by {a.source}; managed by the issuer, not editable here.</p>}
                    {editable && (
                      <div className="cluster" style={{ gap: 8 }}>
                        <button type="button" className="btn btn-quiet" onClick={() => onEdit(a)}><Pencil size={18} aria-hidden="true" />Edit</button>
                        {phase === 'draft' && <button type="button" className="btn btn-quiet" onClick={() => publishDraft(a.id)}><Send size={18} aria-hidden="true" />Publish</button>}
                        <button type="button" className="btn btn-quiet" onClick={() => onResolve(a)}><CircleCheck size={18} aria-hidden="true" />{phase === 'draft' ? 'Withdraw' : 'Resolve'}</button>
                      </div>
                    )}
                  </div>
                </article>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
  return (
    <section className="section" aria-labelledby="advisories" style={{ marginTop: 24 }}>
      <h2 id="advisories" className="h2">Advisories</h2>
      {!manage && (
        <p className="banner tone-saved">
          <TriangleAlert size={20} aria-hidden="true" />
          <span>Read-only. Only the DRRMO Coordinator can create, edit, publish or resolve campus advisories.</span>
        </p>
      )}
      {group('Published and active', 'adv-active', active, 'No active advisories. Students see none.')}
      {group('Drafts', 'adv-drafts', drafts, 'No drafts.')}
      {group('Resolved or expired', 'adv-ended', ended, 'Nothing resolved or expired yet.')}
    </section>
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
  { id: 'open', label: 'Open' },
  { id: 'slow', label: 'Slow' },
  { id: 'closed', label: 'Closed' },
]
const expiryLabel = (h: number | null) => (h == null ? 'No end time' : `In ${h} hour${h === 1 ? '' : 's'}`)

function AdvisoryForm({ editing, onDone }: { editing: Advisory | null; onDone: () => void }) {
  const id = useId()
  const worst = corridors.find((c) => getState().snapshot.corridors[c.id].status === 'closed')
  const [scope, setScope] = useState(editing?.scope ?? worst?.id ?? 'campus')
  const [sev, setSev] = useState<Severity>(editing?.severity ?? 'warning')
  const [status, setStatus] = useState<CorridorStatus | 'keep'>(editing?.corridorStatus ?? 'keep')
  const [title, setTitle] = useState(editing?.title ?? '')
  const [body, setBody] = useState(editing?.body ?? '')
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

  return (
    <form className="stack" style={{ gap: 20 }} noValidate onSubmit={(e) => { e.preventDefault(); submit(true) }}>
      {editing && !isDraft && (
        <p className="banner tone-warn">
          <TriangleAlert size={20} aria-hidden="true" />
          <span>This advisory is live. Saving changes updates what students see straight away.</span>
        </p>
      )}
      <div className="field">
        <label htmlFor={`${id}-scope`}>Who sees it</label>
        <select id={`${id}-scope`} className="input" value={scope} onChange={(e) => { setScope(e.target.value); if (!isCorridorScope(e.target.value)) setStatus('keep') }}>
          <option value="campus">Whole campus</option>
          <option value="all">All corridors</option>
          {corridors.map((c) => <option key={c.id} value={c.id}>{c.name} corridor ({c.via})</option>)}
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
          <p className="meta">Applied when the advisory is published. Closed tells students on this corridor to wait on campus.</p>
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
          {editing && <option value="keep">{editing.expiresAt ? `Keep current end (${clock(editing.expiresAt)})` : 'Keep: no end time'}</option>}
          {EXPIRY_HOURS.map((h) => <option key={String(h)} value={h == null ? 'none' : String(h)}>{expiryLabel(h)}</option>)}
        </select>
        <p className="meta">After its end time an advisory stops showing as current for students.</p>
        {err('expiresInHours')}
      </div>

      <p className="meta">
        <Users size={16} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />
        Reaches about {reach} students{corridor ? ` on the ${corridor.name} corridor first` : ''} once published.
      </p>
      {formError && <p className="error" role="alert"><TriangleAlert size={16} aria-hidden="true" />{formError}</p>}

      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onDone}>Cancel</button>
        {isDraft && <button type="button" className="btn btn-secondary" onClick={() => submit(false)}>{editing ? 'Save draft' : 'Save as draft'}</button>}
        <button type="submit" className="btn btn-danger">{!editing ? 'Publish now' : isDraft ? 'Save and publish' : 'Save changes'}</button>
      </div>
    </form>
  )
}

// ── Resolve / withdraw ───────────────────────────────────────────────────────

function ResolveForm({ advisory, onDone }: { advisory: Advisory; onDone: () => void }) {
  const s = useApp()
  const corridor = isCorridorScope(advisory.scope) ? corridors.find((c) => c.id === advisory.scope) : undefined
  const corridorNotOpen = Boolean(corridor && s.snapshot.corridors[corridor.id]?.status !== 'open')
  const [reopen, setReopen] = useState(false)
  const draft = advisory.status === 'draft'
  return (
    <form className="stack" style={{ gap: 20 }} onSubmit={(e) => {
      e.preventDefault()
      if (resolveAdvisory(advisory.id, { reopenCorridor: reopen }).ok) onDone()
    }}>
      <p className="body"><strong>{advisory.title}</strong></p>
      <p className="body">{draft
        ? 'The draft is withdrawn and kept in the record. Students never saw it.'
        : 'Students stop seeing this as a current advisory. It is kept in the record, not deleted.'}</p>
      {!draft && corridor && corridorNotOpen && (
        <label className="cluster" style={{ gap: 10 }}>
          <input type="checkbox" checked={reopen} onChange={(e) => setReopen(e.target.checked)} />
          <span>Also mark {corridor.via} as open again</span>
        </label>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn btn-primary">{draft ? 'Withdraw draft' : 'Resolve advisory'}</button>
      </div>
    </form>
  )
}
