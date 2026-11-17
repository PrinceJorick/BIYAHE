import { Check, CircleCheck, Clock, LayoutDashboard, LogOut, Megaphone, Smartphone, TriangleAlert, Users, X } from 'lucide-react'
import { useId, useState } from 'react'
import Badge from '../components/Badge'
import CorridorMap from '../components/CorridorMap'
import Dialog from '../components/Dialog'
import Logo, { LogoMark } from '../components/Logo'
import { corridors, type Amenity, type CorridorStatus, type Severity } from '../data'
import { amenityLabel, clock, spacesLeft } from '../lib/derive'
import { useMedia } from '../lib/router'
import { adjustOccupancy, chooseRole, getState, isOffline, publishAdvisory, toggleAmenity, useApp, useNow } from '../lib/store'

const statusView: Record<CorridorStatus, { tone: string; Icon: typeof Clock; label: string; unit: string }> = {
  open: { tone: 'ok', Icon: CircleCheck, label: 'Open', unit: 'affected' },
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
  const [publishing, setPublishing] = useState(false)
  const offline = isOffline(s)
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
          <button className="btn btn-danger" onClick={() => setPublishing(true)}>
            <Megaphone size={20} aria-hidden="true" />Publish Campus / Route Advisory
          </button>
        </header>

        <div className="coord-split">
          <section className="section" aria-labelledby="risk">
            <h2 id="risk" className="h2">Route risk</h2>
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
            <p className="meta">Estimates come from route selections only. Aggregated, never per student (RA 10173).</p>
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
      </main>

      <Dialog open={publishing} onClose={() => setPublishing(false)} title="Publish advisory">
        <PublishForm onDone={() => setPublishing(false)} />
      </Dialog>
    </div>
  )
}

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

function PublishForm({ onDone }: { onDone: () => void }) {
  const id = useId()
  const worst = corridors.find((c) => getState().snapshot.corridors[c.id].status === 'closed')
  const [scope, setScope] = useState(worst?.id ?? 'campus')
  const [sev, setSev] = useState<Severity>('warning')
  const [status, setStatus] = useState<CorridorStatus | 'keep'>('keep')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [missing, setMissing] = useState(false)
  const corridor = corridors.find((c) => c.id === scope)
  const reach = corridor ? corridor.commuters : corridors.reduce((n, c) => n + c.commuters, 0)

  return (
    <form
      className="stack"
      style={{ gap: 20 }}
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (!title.trim()) {
          setMissing(true)
          document.getElementById(`${id}-title`)?.focus()
          return
        }
        publishAdvisory({ scope, severity: sev, title: title.trim(), body: body.trim(), status: corridor && status !== 'keep' ? status : undefined })
        onDone()
      }}
    >
      <div className="field">
        <label htmlFor={`${id}-scope`}>Who sees it</label>
        <select id={`${id}-scope`} className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="campus">Whole campus</option>
          <option value="all">All routes</option>
          {corridors.map((c) => <option key={c.id} value={c.id}>{c.name} route ({c.via})</option>)}
        </select>
      </div>

      <div className="field" role="group" aria-labelledby={`${id}-sev`}>
        <span id={`${id}-sev`} className="field-label">Severity</span>
        <div className="chips">
          {severities.map((x) => <button key={x.id} type="button" className="chip" aria-pressed={sev === x.id} onClick={() => setSev(x.id)}>{x.label}</button>)}
        </div>
      </div>

      {corridor && (
        <div className="field" role="group" aria-labelledby={`${id}-st`}>
          <span id={`${id}-st`} className="field-label">Set {corridor.via} to</span>
          <div className="chips">
            {statuses.map((x) => <button key={x.id} type="button" className="chip" aria-pressed={status === x.id} onClick={() => setStatus(x.id)}>{x.label}</button>)}
          </div>
          <p className="meta">Closed tells students on this route to wait on campus.</p>
        </div>
      )}

      <div className="field">
        <label htmlFor={`${id}-title`}>Headline</label>
        <input id={`${id}-title`} className="input" value={title} maxLength={90} autoComplete="off" placeholder="Flooding near Balagtas"
          aria-invalid={missing && !title.trim()} aria-describedby={missing && !title.trim() ? `${id}-err` : undefined}
          onChange={(e) => setTitle(e.target.value)} />
        {missing && !title.trim() && <p id={`${id}-err`} className="error"><TriangleAlert size={16} aria-hidden="true" />Add a headline so students know what changed.</p>}
      </div>

      <div className="field">
        <label htmlFor={`${id}-body`}>Details (optional)</label>
        <textarea id={`${id}-body`} className="input" value={body} maxLength={280} onChange={(e) => setBody(e.target.value)} />
      </div>

      <p className="meta"><Users size={16} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />Reaches about {reach} students{corridor ? ` on the ${corridor.name} route first` : ''}. It appears in their app straight away.</p>

      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn btn-danger">Publish now</button>
      </div>
    </form>
  )
}
