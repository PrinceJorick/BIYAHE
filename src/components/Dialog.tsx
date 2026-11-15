import { useEffect, useId, useRef, type ReactNode } from 'react'

// Native modal <dialog>: the browser traps focus, makes the page inert, closes on Escape
// and returns focus to the control that opened it.
export default function Dialog({ open, onClose, title, children }: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      {open && (
        <div className="dialog-body">
          <h2 id={titleId} className="h1">{title}</h2>
          {children}
        </div>
      )}
    </dialog>
  )
}
