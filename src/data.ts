// Simulated campus + advisory data for the MVP (no student input).

export type Scenario = 'clear' | 'disrupted' | 'offline'

export const student = { name: 'Mika', initial: 'M', campus: 'Alangilan Campus' }

export const route = {
  from: 'Alangilan',
  to: 'Lipa City',
  modes: 'Jeepney, then tricycle',
  usualMin: 50,
  disruptedMin: 165,
  lastClass: '4:00 PM',
  eta: '4:55 PM',
}

export type Spot = {
  id: string
  name: string
  walkMin: number
  left: number
  capacity: number
  amenities: ('Charging' | 'Food and water' | 'Wi-Fi')[]
  pos: [number, number]
}

export const spots: Spot[] = [
  { id: 'cics', name: 'CICS Building lobby', walkMin: 3, left: 120, capacity: 180, amenities: ['Charging', 'Food and water', 'Wi-Fi'], pos: [13.7849, 121.0745] },
  { id: 'gym', name: 'University Gymnasium', walkMin: 6, left: 300, capacity: 500, amenities: ['Charging', 'Food and water'], pos: [13.7838, 121.0727] },
  { id: 'sc', name: 'Student Center', walkMin: 4, left: 0, capacity: 150, amenities: [], pos: [13.7832, 121.0752] },
]

export const youAreHere: [number, number] = [13.7842, 121.074]

export const usualRoute: [number, number][] = [
  [13.7842, 121.074], [13.7875, 121.0705], [13.7935, 121.0655], [13.8, 121.064], [13.81, 121.07],
]
export const saferRoute: [number, number][] = [
  [13.7842, 121.074], [13.7849, 121.0745],
]
export const floodZone: [number, number] = [13.7935, 121.0655]

export type Alert = {
  id: string
  title: string
  body: string
  source: string
  time: string
  kind: 'route' | 'weather' | 'campus' | 'shelter'
  mine?: boolean
}

export const alerts: Alert[] = [
  { id: 'a1', title: 'Flooding on your route', body: 'Knee-deep water reported near Batangas City proper.', source: 'LGU Batangas City', time: '3:02 PM', kind: 'route', mine: true },
  { id: 'a2', title: 'Orange rainfall warning', body: 'Heavy rain expected over Batangas for the next 3 hours.', source: 'PAGASA', time: '2:45 PM', kind: 'weather' },
  { id: 'a3', title: 'Classes suspended', body: 'Face-to-face classes suspended from 3:30 PM.', source: 'BatStateU', time: '2:30 PM', kind: 'campus' },
  { id: 'a4', title: 'Gymnasium opened', body: '300 spaces with charging, food and water.', source: 'Campus DRRM', time: '2:20 PM', kind: 'shelter' },
]

export const fmtMin = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`)
