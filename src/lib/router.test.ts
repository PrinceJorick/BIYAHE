import { describe, expect, it } from 'vitest'
import { entryHash, hrefOf, parseHash } from './router'

describe('path deep links', () => {
  it.each([
    ['/map', '', '#/map'],
    ['/coordinator/', '', '#/coordinator'],
    ['/safespots', '', '#/map'],
    ['/Alerts', '', '#/alerts'],
    ['/profile', '#/', '#/settings'],
    ['/settings', '', '#/settings'],
    ['/home', '#', '#/home'],
    ['/welcome', '', '#/welcome'],
    ['/go/route/lipa', '', '#/go/route/lipa'],
    ['/map/spot/gym/', '', '#/map/spot/gym'],
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

describe('hash routes with an argument', () => {
  it.each([
    ['#/home', { name: 'home', arg: null }],
    ['#/go/route/lipa', { name: 'go', arg: 'route/lipa' }],
    ['#/go/spot/pb-gym', { name: 'go', arg: 'spot/pb-gym' }],
    ['#/map/', { name: 'map', arg: null }],
    ['#/profile', { name: 'settings', arg: null }],
    ['#/alerts?filter=news', { name: 'alerts', arg: null, query: 'filter=news' }],
    ['#/nope/x', { name: null, arg: null }],
    ['', { name: null, arg: null }],
  ])('%s', (hash, want) => expect(parseHash(hash)).toEqual(want))

  it('builds the same hrefs it parses', () => {
    expect(hrefOf('go', 'spot/gym')).toBe('#/go/spot/gym')
    expect(parseHash(hrefOf('map', 'route/bauan'))).toEqual({ name: 'map', arg: 'route/bauan' })
    expect(hrefOf('alerts')).toBe('#/alerts')
  })
})
