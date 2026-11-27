import { ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { campuses, CAMPUS_IDS } from '../campuses'
import { ACTIVE_CAMPUS, switchCampus } from '../campuses/active'
import Logo from '../components/Logo'
import MarshalSpotPicker from '../components/MarshalSpotPicker'
import { go } from '../lib/router'
import { chooseRole, getState, setStaffRole, STAFF_ROLES, useApp } from '../lib/store'
import type { CampusId } from '../types'

export default function StaffAccess() {
  const s = useApp()
  const [campusId, setCampusId] = useState<CampusId>(ACTIVE_CAMPUS.id)
  return (
    <main id="main" tabIndex={-1} className="solo">
      <Logo size={36} />
      <form className="stack-lg" onSubmit={(e) => { e.preventDefault(); if (!switchCampus(campusId, '#/coordinator')) go('coordinator') }}>
        <div className="page-head">
          <h1 className="h1">Staff access</h1>
          <p className="body">Demo access, no sign-in. Pick your campus and role.</p>
        </div>
        <fieldset className="choices">
          <legend className="eyebrow">Campus</legend>
          {CAMPUS_IDS.map((id) => (
            <label key={id} className="choice">
              <input type="radio" name="campus" checked={campusId === id} onChange={() => setCampusId(id)} />
              <span className="item-title">{campuses[id].shortName}</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="choices">
          <legend className="eyebrow">Your role</legend>
          {STAFF_ROLES.map((r) => (
            <label key={r.id} className="choice">
              <input type="radio" name="role" checked={s.staffRole === r.id} onChange={() => setStaffRole(r.id)} />
              <span className="item-body">
                <span className="item-title">{r.id}</span>
                <span className="meta">{r.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {s.staffRole === 'Building Marshal' && <MarshalSpotPicker spots={campuses[campusId].spots} />}
        <p className="banner">
          <ShieldCheck size={20} aria-hidden="true" />
          <span>You see counts per route and safe spot only. No student names, IDs or locations (RA 10173).</span>
        </p>
        <div className="solo-actions">
          <button type="submit" className="btn btn-primary btn-block">Open Command Dashboard</button>
          <button type="button" className="btn btn-quiet" onClick={() => { chooseRole('student'); go(getState().corridorId ? 'home' : 'setup') }}>Back to student view</button>
        </div>
      </form>
    </main>
  )
}
