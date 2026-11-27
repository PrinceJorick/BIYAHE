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
  // The close event also fires after a programmatic close (open turned false, e.g. one dialog handing over to
  // another); only a close the person made (Escape, backdrop) is reported.
  const wanted = useRef(open)

  useEffect(() => {
    wanted.current = open
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
      onClose={() => { if (wanted.current) onClose() }}
      onClick={(e) => {
        if (e.target === ref.current) ref.current.close()
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
