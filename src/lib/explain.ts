// Client side of /api/explain (api/explain.ts): asks Gemini to rephrase BIYAHE's own recommendation reason.
// Optional: on any failure the app keeps showing the rule and facts it already has.
import type { Reason } from './places'

export async function fetchExplanation(reason: Reason, fetchImpl: typeof fetch = fetch): Promise<string> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 15_000)
  try {
    const res = await fetchImpl('/api/explain', {
      method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reason),
    })
    const body = (await res.json().catch(() => null)) as { explanation?: unknown; error?: unknown } | null
    if (!res.ok || typeof body?.explanation !== 'string') throw new Error(typeof body?.error === 'string' ? body.error : `explain HTTP ${res.status}`)
    return body.explanation
  } finally {
    clearTimeout(timer)
  }
}
