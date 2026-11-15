import type { ReactNode } from 'react'

export default function Toggle({ label, checked, onChange, hideLabel = false, icon }: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
  hideLabel?: boolean
  icon?: ReactNode
}) {
  return (
    <button type="button" className="toggle" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
      {icon}
      {!hideLabel && <span aria-hidden="true">{label}</span>}
      <span className="toggle-track" aria-hidden="true" />
      <span className="toggle-state" aria-hidden="true">{checked ? 'On' : 'Off'}</span>
    </button>
  )
}
