// What a student is told when shared data changes (another tab, or Supabase Realtime): the screen itself updates on
// its own; this picks the one toast worth showing. Priority: their route's status changed, then a new advisory, then
// an advisory they were shown was updated, then one was resolved. Pure (studentNotice.test.ts).
import type { Advisory, Corridor, Snapshot } from '../types'
import { lastChanged, studentAdvisories } from './advisories'
import { routeStates, routeWord } from './routeStatus'

export type Notice = { text: string; urgent: boolean; advisory?: Advisory }

export function studentNotice(prev: Snapshot, next: Snapshot, corridors: readonly Corridor[], corridorId: string | null, now: number,
  wants: (a: Advisory) => boolean = () => true): Notice | null {
  const mine = corridors.find((c) => c.id === corridorId)
  if (mine) {
    const before = routeStates(prev, corridors, now)[mine.id].status
    const after = routeStates(next, corridors, now)[mine.id].status
    if (before !== after) return { text: `Your route to ${mine.name} is now ${routeWord[after]}.`, urgent: after === 'closed' }
  }
  const was = new Map(studentAdvisories(prev.advisories, corridorId, now).map((a) => [a.id, a]))
  const is = studentAdvisories(next.advisories, corridorId, now).filter(wants)
  const fresh = is.find((a) => !was.has(a.id))
  if (fresh) return { text: `New ${fresh.source === 'Campus' ? 'campus' : fresh.source} advisory: ${fresh.title}`, urgent: fresh.severity === 'critical', advisory: fresh }
  const edited = is.find((a) => was.has(a.id) && lastChanged(a) !== lastChanged(was.get(a.id)!))
  if (edited) return { text: `Advisory updated: ${edited.title}`, urgent: edited.severity === 'critical', advisory: edited }
  const nowIds = new Set(studentAdvisories(next.advisories, corridorId, now).map((a) => a.id))
  const ended = [...was.values()].find((a) => !nowIds.has(a.id) && wants(a))
  if (ended) return { text: `Advisory resolved: ${ended.title}`, urgent: false, advisory: ended }
  return null
}
