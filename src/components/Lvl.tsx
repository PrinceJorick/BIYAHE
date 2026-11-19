import type { ReactNode } from 'react'
import type { Level } from '../lib/traffic'

// Text that reports a level, low → high. This is the only place the UI uses red, amber or green.
export default function Lvl({ level, children, className }: { level: Level; children: ReactNode; className?: string }) {
  return <span className={`lvl lvl-${level}${className ? ` ${className}` : ''}`}>{children}</span>
}
