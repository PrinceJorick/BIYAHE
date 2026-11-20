// Label collision handling on screen, for both map renderers. Labels are placed in priority order (the route in
// focus, then place names, then other routes). Each one first tries its own spot, then a few nearby spots (above,
// below, left, right of it); the first spot that covers no pin and no label already placed and stays inside the
// map wins (its own spot is kept, clipped, when nothing nearby fits). A label with no free spot is hidden until
// there is room (zooming in, panning, a larger screen). Pins are never moved or hidden.

const PRIORITY: [string, number][] = [['.map-tag-focus', 3], ['.map-tag-spot, .map-label-spot', 2], ['.map-tag', 1]]
const priority = (el: Element) => PRIORITY.find(([sel]) => el.matches(sel))?.[1] ?? 0

export type Box = { left: number; top: number; right: number; bottom: number }

const overlaps = (a: Box, b: Box, gap = 2) =>
  a.left < b.right + gap && b.left < a.right + gap && a.top < b.bottom + gap && b.top < a.bottom + gap

const shifted = (b: Box, dx: number, dy: number): Box => ({ left: b.left + dx, right: b.right + dx, top: b.top + dy, bottom: b.bottom + dy })

/** Candidate moves for a label of this size: stay, above, below, left, right (clear of a pin at its anchor). */
export function candidateShifts(b: Box): [number, number][] {
  const w = b.right - b.left
  const h = b.bottom - b.top
  const y = h + 6
  const x = w / 2 + 20
  return [[0, 0], [0, -y], [0, y], [-x, 0], [x, 0]]
}

/**
 * Pure placement: for each label (already in priority order) the first shift that collides with no pin, no placed
 * label and stays inside `bounds`; null = hide it.
 */
export function placeLabels(pins: Box[], labels: Box[], bounds: Box): ([number, number] | null)[] {
  const kept: Box[] = []
  const inside = (b: Box) => b.left >= bounds.left && b.right <= bounds.right && b.top >= bounds.top && b.bottom <= bounds.bottom
  const free = (b: Box) => !pins.some((p) => overlaps(b, p)) && !kept.some((k) => overlaps(b, k))
  return labels.map((l) => {
    // A free spot fully inside the map first; else the label's own spot even if the edge clips it.
    const options = candidateShifts(l).map(([dx, dy]) => ({ s: [dx, dy] as [number, number], b: shifted(l, dx, dy) }))
    const pick = options.find((o) => inside(o.b) && free(o.b)) ?? (free(l) ? options[0] : undefined)
    if (!pick) return null
    kept.push(pick.b)
    return pick.s
  })
}

export function declutter(root: HTMLElement | null) {
  if (!root) return
  // Obstacles: pins, the map's zoom controls (Google's and Leaflet's) and the notes drawn over the map.
  const scope = root.closest('.map') ?? root
  const pins = [...root.querySelectorAll('.pin, .map-campus'), ...scope.querySelectorAll('.gm-bundled-control, .gm-control-active, .leaflet-control-zoom, .map-meta > *')]
    .map((p) => p.getBoundingClientRect()).filter((r) => r.width > 0)
  const els = [...root.querySelectorAll<HTMLElement>('.map-tag, .map-label-spot')].sort((a, b) => priority(b) - priority(a))
  // Measure every label at its own spot first (moves from a previous run are undone).
  for (const el of els) {
    el.style.visibility = ''
    el.style.translate = ''
  }
  const shown = els.filter((el) => el.getBoundingClientRect().width > 0)
  const places = placeLabels(pins, shown.map((el) => el.getBoundingClientRect()), root.getBoundingClientRect())
  shown.forEach((el, i) => {
    const p = places[i]
    if (!p) el.style.visibility = 'hidden'
    else if (p[0] || p[1]) el.style.translate = `${p[0]}px ${p[1]}px`
  })
}
