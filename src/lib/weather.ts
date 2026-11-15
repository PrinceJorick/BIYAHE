import { CAMPUS, type Weather } from '../data'

const URL = `https://api.open-meteo.com/v1/forecast?latitude=${CAMPUS[0]}&longitude=${CAMPUS[1]}&current=temperature_2m,precipitation,weather_code,wind_speed_10m&timezone=Asia%2FManila`

// WMO weather interpretation codes, grouped to the wording a commuter needs.
function label(code: number): string {
  if (code === 0) return 'Clear sky'
  if (code <= 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code <= 48) return 'Fog'
  if (code <= 57) return 'Drizzle'
  if (code === 61 || code === 80) return 'Light rain'
  if (code === 63 || code === 81) return 'Moderate rain'
  if (code <= 67 || code === 82) return 'Heavy rain'
  if (code <= 77) return 'Sleet'
  if (code <= 86) return 'Rain showers'
  return 'Thunderstorm'
}

export async function fetchWeather(): Promise<Weather> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 6000)
  try {
    const res = await fetch(URL, { signal: ctl.signal })
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`)
    const { current } = await res.json()
    return {
      tempC: Math.round(current.temperature_2m),
      precipMm: current.precipitation,
      windKph: Math.round(current.wind_speed_10m),
      label: label(current.weather_code),
      fetchedAt: Date.now(),
      live: true,
    }
  } finally {
    clearTimeout(timer)
  }
}
