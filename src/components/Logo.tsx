import { useId } from 'react'

// App Icon Concept A ("Jeepney Buddy"). Geometry mirrors public/favicon.svg.
// Below 40px the road dashes and smile are dropped so the face stays crisp.
export function LogoMark({ size = 40 }: { size?: number }) {
  const clip = useId()
  const small = size < 40
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clip}><rect width="256" height="256" rx="60" /></clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="256" height="256" fill="#2563EB" />
        <path d="M0 214Q128 184 256 214V256H0Z" fill="#0B2D5B" />
        {!small && <path d="M40 236Q128 214 216 236" fill="none" stroke="#FBBF24" strokeWidth="5" strokeLinecap="round" strokeDasharray="14 14" />}
        <rect x="84" y="58" width="88" height="28" rx="12" fill="#FBBF24" />
        <rect x="58" y="80" width="140" height="118" rx="28" fill="#F8FAFC" />
        <rect x="74" y="98" width="108" height="50" rx="16" fill="#0B2D5B" />
        <path d="M98 128Q108 116 118 128M138 128Q148 116 158 128" fill="none" stroke="#F8FAFC" strokeWidth={small ? 9 : 7} strokeLinecap="round" />
        <circle cx="86" cy="170" r={small ? 13 : 12} fill="#FBBF24" />
        <circle cx="170" cy="170" r={small ? 13 : 12} fill="#FBBF24" />
        {!small && <path d="M112 168Q128 180 144 168" fill="none" stroke="#0B2D5B" strokeWidth="6" strokeLinecap="round" />}
        <rect x="66" y="194" width="28" height="20" rx="7" fill="#0B2D5B" />
        <rect x="162" y="194" width="28" height="20" rx="7" fill="#0B2D5B" />
        <rect x="50" y="186" width="156" height="12" rx="6" fill="#0B2D5B" />
      </g>
    </svg>
  )
}

export default function Logo({ size = 36, onDark = false }: { size?: number; onDark?: boolean }) {
  return (
    <span className="logo" role="img" aria-label="BIYAHE">
      <LogoMark size={size} />
      <span className="logo-word" style={{ fontSize: size * 0.66, color: onDark ? 'var(--cloud)' : 'var(--deep)' }} aria-hidden="true">biyahe</span>
    </span>
  )
}
