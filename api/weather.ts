// GET /api/weather?campus=<id>: current conditions, the next hours and public weather alerts at a campus.
//
// Server path for builds without a browser weather key: calls Google with the server-only GOOGLE_WEATHER_API_KEY
// (WEATHER_API_KEY is read as a fallback name). That key must not carry a website restriction, because server
// requests send no Referer (Google answers 403). Only the three campus points can be asked for, so the endpoint
// cannot be used to spend the quota on arbitrary places. The client itself is src/lib/googleWeather.ts.

import { getWeather, isWeatherCampus } from '../src/lib/googleWeather.js'

export * from '../src/lib/googleWeather.js'

type Env = Record<string, string | undefined>

const serverEnv = (): Env => (globalThis as { process?: { env: Env } }).process?.env ?? {}

/** Shared by the Vercel Function and the Vite dev/preview middleware. */
export async function handleWeather(request: Request, env: Env = serverEnv(), fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return Response.json({ error: 'method not allowed' }, { status: 405, headers: { Allow: 'GET, HEAD' } })
  const campus = new URL(request.url).searchParams.get('campus')
  if (!isWeatherCampus(campus)) return Response.json({ error: 'unknown campus' }, { status: 400 })
  const body = await getWeather(campus, env, fetchImpl)
  const cacheable = body.current && !body.error
  return Response.json(body, {
    headers: { 'Cache-Control': cacheable ? 'public, s-maxage=1200, stale-while-revalidate=600' : 'no-store', 'X-Content-Type-Options': 'nosniff' },
  })
}

export function GET(request: Request) {
  return handleWeather(request)
}
