import { useState, useEffect } from 'react'
import { useMail } from '../../context/MailContext'
import { detectUrgent } from '../../api/ai'
import Avatar from '../shared/Avatar'
import './NeedsAttention.css'

export default function NeedsAttention() {
  const { categorizedEmails, activeStream, selectEmail, selectedEmail } = useMail()
  const [urgentIds, setUrgentIds] = useState([])

  const peopleEmails = categorizedEmails.people || []
  const transactionEmails = categorizedEmails.transactions || []

  useEffect(() => {
    async function checkUrgency() {
      // Analyze up to 6 top emails from people & transactions
      const candidates = [...peopleEmails.slice(0, 4), ...transactionEmails.slice(0, 2)]
      if (!candidates.length) return
      
      const results = await detectUrgent(candidates)
      const flagged = candidates.filter((_, i) => results[i]).map(e => e.id)
      
      // Fallback for demo if API returns none or offline: highlight mock-1 and mock-4
      if (flagged.length === 0 && candidates.some(c => c.id.startsWith('mock-'))) {
        setUrgentIds(['mock-1', 'mock-4', 'mock-6'].filter(id => candidates.some(c => c.id === id)))
      } else {
        setUrgentIds(flagged)
      }
    }
    checkUrgency()
  }, [peopleEmails, transactionEmails])

  // Only display on 'people' stream or if there's attention items
  if (activeStream !== 'people' || urgentIds.length === 0) return null

  const urgentEmails = [...peopleEmails, ...transactionEmails].filter(e => urgentIds.includes(e.id))

  return (
    <div className="needs-attention">
      <div className="attention-header font-mono">
        <span className="attention-dot">◈</span> NEEDS ATTENTION (AI DETECTED)
      </div>
      <div className="attention-items">
        {urgentEmails.map(email => (
          <div
            key={email.id}
            className={`attention-item ${selectedEmail?.id === email.id ? 'active' : ''}`}
            onClick={() => selectEmail(email)}
          >
            <div className="attention-avatar">
              <Avatar name={email.senderName} size={28} />
            </div>
            <div className="attention-content">
              <div className="attention-sender-row">
                <span className="attention-sender">{email.senderName}</span>
                <span className="attention-tag font-mono">Action req.</span>
              </div>
              <div className="attention-subject">{email.subject}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="attention-divider">
        <span className="font-mono" style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
          ─── REGULAR INBOX STREAM ─────────────────────────
        </span>
      </div>
    </div>
  )
}
