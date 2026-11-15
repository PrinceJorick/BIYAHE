import { ArrowLeft, Copy, MessageSquare, Send } from 'lucide-react'
import { useState } from 'react'
import { shareMessage, studentView } from '../lib/derive'
import { toast, useApp, useNow } from '../lib/store'

export default function Share() {
  const s = useApp()
  const v = studentView(s, useNow())
  const [mode, setMode] = useState<'campus' | 'home'>(v.decision === 'wait' ? 'campus' : 'home')
  const text = shareMessage(v, mode)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast('Message copied. Paste it into any chat.')
    } catch {
      toast('Could not copy. Press and hold the message to copy it.')
    }
  }
  const share = async () => {
    if (!navigator.share) return copy()
    try {
      await navigator.share({ text })
    } catch {
      // closed the share sheet: nothing to do
    }
  }

  return (
    <div className="page">
      <a className="btn btn-quiet" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} href="#/home"><ArrowLeft size={18} aria-hidden="true" />Home</a>
      <div className="page-head">
        <h1 className="h1">Tell family you're safe</h1>
        <p className="body">The message is written for you. Change who it goes to, not what to type.</p>
      </div>
      <div className="chips" role="group" aria-label="What to tell them">
        <button className="chip" aria-pressed={mode === 'campus'} onClick={() => setMode('campus')}>On campus</button>
        <button className="chip" aria-pressed={mode === 'home'} onClick={() => setMode('home')}>Heading home</button>
      </div>
      <p className="quote" aria-label="Message preview">{text}</p>
      <div className="actions">
        <button className="btn btn-primary btn-block" onClick={share}><Send size={20} aria-hidden="true" />Share message</button>
        <a className="btn btn-secondary btn-block" href={`sms:?&body=${encodeURIComponent(text)}`}><MessageSquare size={20} aria-hidden="true" />Send by SMS{v.offline && ' (works offline)'}</a>
        <button className="btn btn-quiet" onClick={copy}><Copy size={18} aria-hidden="true" />Copy text</button>
      </div>
      <p className="meta">BIYAHE never sees who you send this to. Nothing leaves your phone until you choose where to share it.</p>
    </div>
  )
}
