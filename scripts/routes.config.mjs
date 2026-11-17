// Corridor configuration for the developer-only route generator (scripts/build-routes.mjs).
// The data lives in src/lib/routeChecks.js so src/lib/routeChecks.test.ts can type-check and test it
// (tsc cannot type a .mjs import from outside src/). Edit it there; this file only re-exports it.
export { CAMPUS, CAMPUS_ACCESS_ROADS, CORRIDORS, ROAD_GROUP_SOURCE } from '../src/lib/routeChecks.js'
