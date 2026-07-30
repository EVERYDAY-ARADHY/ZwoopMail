import { useState, useEffect } from 'react'
import { useMail } from '../../context/MailContext'
import { sendEmail } from '../../api/gmail'
import { composeAssist } from '../../api/ai'
import Button from '../shared/Button'
import './Compose.css'

const AI_ACTIONS = [
  { id: 'professional', label: 'Professional', icon: '■', desc: 'Formal and business-ready' },
  { id: 'casual', label: 'Casual', icon: '●', desc: 'Warm and conversational' },
  { id: 'shorter', label: 'Make Shorter', icon: '►', desc: 'Concise and to the point' },
  { id: 'fix_grammar', label: 'Fix Grammar', icon: '✦', desc: 'Clean up errors & phrasing' },
  { id: 'urgent', label: 'Urgent Tone', icon: '▲', desc: 'Convey high importance' }
]

export default function Compose() {
  const { isComposing, toggleCompose, accessToken } = useMail()
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [activeAiAction, setActiveAiAction] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (typeof isComposing === 'object' && isComposing !== null) {
      setTo(isComposing.to || '')
      setSubject(isComposing.subject || '')
      setBody(isComposing.body || '')
    } else if (isComposing === true) {
      setTo('')
      setSubject('')
      setBody('')
    }
  }, [isComposing])

  if (!isComposing) return null

  const handleSend = async (e) => {
    e.preventDefault()
    if (!to || !subject) {
      setError('Please fill in recipient and subject.')
      return
    }

    setIsSending(true)
    setError(null)
    try {
      if (accessToken) {
        await sendEmail(accessToken, { to, subject, body })
      } else {
        // Demo fallback simulation
        await new Promise((res) => setTimeout(res, 1000))
        console.log('Demo Mode: Simulated sending email to', to)
      }
      toggleCompose()
    } catch (err) {
      setError('Failed to send email. Check API quota or permissions.')
    } finally {
      setIsSending(false)
    }
  }

  const handleAiAssist = async (actionId) => {
    if (!body) {
      setError('Write some draft content first before using AI assist!')
      return
    }
    setAiLoading(true)
    setActiveAiAction(actionId)
    setError(null)
    try {
      const rewritten = await composeAssist(body, actionId)
      if (rewritten) {
        setBody(rewritten)
      }
    } catch (err) {
      console.error(err)
      setError(`AI Assist error: ${err.message || 'Failed to rewrite text'}`)
    } finally {
      setAiLoading(false)
      setActiveAiAction(null)
    }
  }

  return (
    <div className="compose-overlay animate-fade-in">
      <div className="compose-modal">
        {/* Header */}
        <div className="compose-header">
          <div className="compose-title font-display">New Message</div>
          <button className="compose-close font-mono" onClick={toggleCompose}>✕</button>
        </div>

        <div className="compose-body-container">
          {/* Main Form */}
          <form className="compose-form" onSubmit={handleSend}>
            <div className="compose-field">
              <span className="compose-field-label font-mono">To:</span>
              <input
                type="email"
                placeholder="name@domain.com"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="compose-input"
                autoFocus
              />
            </div>

            <div className="compose-field">
              <span className="compose-field-label font-mono">Subject:</span>
              <input
                type="text"
                placeholder="What is this regarding?"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="compose-input"
              />
            </div>

            <textarea
              className="compose-textarea"
              placeholder="Type your message here... Use AI assist on the right to shape your tone."
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />

            {error && <div className="compose-error font-mono">{error}</div>}

            <div className="compose-footer">
              <div className="compose-footer-left">
                <span className="font-mono" style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                  ── Caldera × ASCII Compose ──
                </span>
              </div>
              <div className="compose-actions">
                <Button variant="ghost" onClick={toggleCompose} type="button">
                  Discard
                </Button>
                <Button variant="primary" type="submit" disabled={isSending} icon="↗">
                  {isSending ? 'Sending...' : 'Send Email'}
                </Button>
              </div>
            </div>
          </form>

          {/* AI Assist Sidebar */}
          <aside className="compose-ai">
            <div className="compose-ai-header font-mono">
              <span style={{ color: 'var(--color-plasma-violet)' }}>◉</span> AI Tone & Assist
            </div>
            <p className="compose-ai-subtitle">
              Draft your raw thoughts, let Llama/Gemini polish the tone instantly.
            </p>

            <div className="compose-ai-options">
              {AI_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className={`ai-action-btn ${activeAiAction === action.id ? 'loading' : ''}`}
                  onClick={() => handleAiAssist(action.id)}
                  disabled={aiLoading}
                >
                  <span className="ai-action-icon">{action.icon}</span>
                  <div className="ai-action-text">
                    <div className="ai-action-label">{action.label}</div>
                    <div className="ai-action-desc">{action.desc}</div>
                  </div>
                  {activeAiAction === action.id && <span className="font-mono">⠋</span>}
                </button>
              ))}
            </div>

            <div className="compose-ai-footer font-mono">
              ┌─ Powered by Groq / Gemini ─┐<br />
              │ &nbsp;&nbsp;&nbsp;0.3s warm-up tokens&nbsp;&nbsp;&nbsp; │<br />
              └────────────────────────────┘
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
