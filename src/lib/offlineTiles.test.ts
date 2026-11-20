import { describe, expect, it } from 'vitest'
import { campuses, CAMPUS_IDS } from '../campuses'
import { MAX_TILES, saveOfflineTiles, TILE_URL, tilesFor } from './offlineTiles'

describe('offline street tiles', () => {
  it('covers each campus and its routes with a small fixed set (OSM policy: under 250 tiles at zoom 13+)', () => {
    for (const id of CAMPUS_IDS) {
      const c = campuses[id]
      const tiles = tilesFor([c.location, ...c.corridors.flatMap((r) => r.path)])
      expect(tiles.length).toBeGreaterThan(0)
      expect(tiles.length).toBeLessThanOrEqual(MAX_TILES)
      expect(tiles.filter((t) => t.z >= 13).length).toBeLessThan(250)
      expect(Math.max(...tiles.map((t) => t.z))).toBe(13)
      // the whole padded area fits under the cap, so no zoom-13 tile is cut off
      expect(tilesFor([c.location, ...c.corridors.flatMap((r) => r.path)], undefined, 10_000)).toHaveLength(tiles.length)
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
    const n = await saveOfflineTiles([[13.7842, 121.0744], [13.94, 121.16]], { fetchImpl: f, force: true })
    expect(n).toBe(urls.length)
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('does nothing without a service worker to keep the tiles', async () => {
    const f = (async () => new Response('')) as unknown as typeof fetch
    expect(await saveOfflineTiles([[13.7842, 121.0744]], { fetchImpl: f })).toBe(0)
  })
})
