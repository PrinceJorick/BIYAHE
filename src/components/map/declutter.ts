// Label collision handling on screen, for both map renderers. Labels are checked in priority order (the route in
// focus, then place names, then other routes) against every pin and every label already kept; one that would
// overlap is hidden until there is room for it (zooming in, panning, a larger screen). Pins are never hidden.

const PRIORITY: [string, number][] = [['.map-tag-focus', 3], ['.map-tag-spot, .map-label-spot', 2], ['.map-tag', 1]]
const priority = (el: Element) => PRIORITY.find(([sel]) => el.matches(sel))?.[1] ?? 0

const overlaps = (a: DOMRect, b: DOMRect, gap = 2) =>
  a.left < b.right + gap && b.left < a.right + gap && a.top < b.bottom + gap && b.top < a.bottom + gap

export function declutter(root: HTMLElement | null) {
  if (!root) return
  const pins = [...root.querySelectorAll('.pin, .map-campus')].map((p) => p.getBoundingClientRect()).filter((r) => r.width > 0)
  const labels = [...root.querySelectorAll<HTMLElement>('.map-tag, .map-label-spot')]
    .sort((a, b) => priority(b) - priority(a))
  const kept: DOMRect[] = []
  for (const el of labels) {
    el.style.visibility = ''
    const r = el.getBoundingClientRect()
    if (r.width === 0) continue
    if (pins.some((p) => overlaps(r, p)) || kept.some((k) => overlaps(r, k))) el.style.visibility = 'hidden'
    else kept.push(r)
  }
}
