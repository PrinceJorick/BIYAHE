import { describe, expect, it } from 'vitest'
import { campuses, CAMPUS_IDS } from '../campuses'
import { BASE_ZOOM, campusTiles, MAX_TILES, offlineTileSet, saveOfflineTiles, TILE_URL, tilesFor } from './offlineTiles'

describe('offline street tiles', () => {
  it('covers each campus and its routes with a small fixed set (OSM policy: under 250 tiles at zoom 13+)', () => {
    for (const id of CAMPUS_IDS) {
      const c = campuses[id]
      const tiles = tilesFor([c.location, ...c.corridors.flatMap((r) => r.path)])  // zoom 12-13
      expect(tiles.length).toBeGreaterThan(0)
      expect(tiles.length).toBeLessThanOrEqual(MAX_TILES)
      expect(tiles.filter((t) => t.z >= 13).length).toBeLessThan(250)
      expect(Math.max(...tiles.map((t) => t.z))).toBe(13)
      // the whole padded area fits under the cap, so no zoom-13 tile is cut off
      expect(tilesFor([c.location, ...c.corridors.flatMap((r) => r.path)], undefined, 10_000)).toHaveLength(tiles.length)
    }
  })

  it('saves every campus: the routes at zoom 9-13 and the campus at 14-16, each tile once, within the OSM policy', () => {
    const all = offlineTileSet()
    const keys = all.map((t) => `${t.z}/${t.x}/${t.y}`)
    expect(new Set(keys).size).toBe(keys.length)
    expect(all.filter((t) => t.z >= 13).length).toBeLessThan(250)
    expect(all.length).toBeLessThan(600)
    for (const id of CAMPUS_IDS) {
      const c = campuses[id]
      const mine = campusTiles(c)
      for (const t of mine) expect(keys).toContain(`${t.z}/${t.x}/${t.y}`)
      // The campus point and every safe spot have a tile at every saved zoom, including the base zoom.
      for (const z of [9, 10, 11, 12, BASE_ZOOM, 14, 15, 16]) {
        for (const p of [c.location, ...c.spots.map((x) => x.pos)]) {
          const [t] = tilesFor([p], [z], 1, 0)
          expect(keys, `${id} z${z}`).toContain(`${t.z}/${t.x}/${t.y}`)
        }
      }
      // Every point of every route is inside the saved base-zoom tiles.
      for (const r of c.corridors) for (const p of r.path) {
        const [t] = tilesFor([p], [BASE_ZOOM], 1, 0)
        expect(keys, `${id} ${r.id}`).toContain(`${t.z}/${t.x}/${t.y}`)
      }
    }
  })

  it('finds the right tile for a point', () => {
    // Alangilan campus at zoom 13
    expect(tilesFor([[13.7842, 121.0744]], [13], 200, 0)).toEqual([{ z: 13, x: 6851, y: 3779 }])
    expect(TILE_URL(13, 6851, 3779)).toBe('https://tile.openstreetmap.org/13/6851/3779.png')
  })

  it('requests each tile once and never throws on failures', async () => {
    const urls: string[] = []
    const f = (async (u: string) => { urls.push(u); if (urls.length % 3 === 0) throw new Error('offline'); return new Response('') }) as unknown as typeof fetch
    const n = await saveOfflineTiles(tilesFor([[13.7842, 121.0744], [13.94, 121.16]]), { fetchImpl: f, force: true })
    expect(n).toBe(urls.length)
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('does nothing without a service worker to keep the tiles', async () => {
    const f = (async () => new Response('')) as unknown as typeof fetch
    expect(await saveOfflineTiles(tilesFor([[13.7842, 121.0744]]), { fetchImpl: f })).toBe(0)
  })
})
