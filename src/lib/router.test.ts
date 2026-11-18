import { describe, expect, it } from 'vitest'
import { entryHash } from './router'

describe('path deep links', () => {
  it.each([
    ['/map', '', '#/map'],
    ['/coordinator/', '', '#/coordinator'],
    ['/safespots', '', '#/map'],
    ['/Alerts', '', '#/alerts'],
    ['/profile', '#/', '#/profile'],
    ['/home', '#', '#/home'],
    ['/welcome', '', '#/welcome'],
  ])('%s%s → %s', (path, hash, want) => expect(entryHash(path, hash)).toBe(want))

  it('sends an unknown path to the start, where the role rules pick the screen', () => {
    expect(entryHash('/does-not-exist', '')).toBe('#/')
  })

  it('leaves the root and existing hash routes alone (no redirect loop)', () => {
    expect(entryHash('/', '')).toBeNull()
    expect(entryHash('/', '#/map')).toBeNull()
    expect(entryHash('/index.html', '')).toBeNull()
    expect(entryHash('/map', '#/alerts')).toBeNull()
  })
})
