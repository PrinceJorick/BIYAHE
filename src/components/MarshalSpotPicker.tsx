// "Your building" for a Building Marshal (staff access and staff Settings): the one safe spot they look after.
import type { SpotSeed } from '../types'
import { setStaffSpot, useApp } from '../lib/store'

export default function MarshalSpotPicker({ spots }: { spots: readonly Pick<SpotSeed, 'id' | 'name'>[] }) {
  const s = useApp()
  // The saved choice if it is one of these spots, else the first (the same default the permissions use).
  const current = spots.some((x) => x.id === s.staffSpotId) ? s.staffSpotId : spots[0]?.id
  return (
    <fieldset className="choices">
      <legend className="eyebrow">Your building</legend>
      {spots.map((x) => (
        <label key={x.id} className="choice">
          <input type="radio" name="marshal-spot" checked={current === x.id} onChange={() => setStaffSpot(x.id)} />
          <span className="item-title">{x.name}</span>
        </label>
      ))}
    </fieldset>
  )
}
