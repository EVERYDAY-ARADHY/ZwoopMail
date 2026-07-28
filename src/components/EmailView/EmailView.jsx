import { useState } from 'react'
import { useMail } from '../../context/MailContext'
import Avatar from '../shared/Avatar'
import Button from '../shared/Button'
import EmptyState from '../shared/EmptyState'
import './EmailView.css'

export default function EmailView() {
  const { selectedEmail, accessToken, user } = useMail()
  const [readerMode, setReaderMode] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  if (!selectedEmail) {
    return (
      <div className="email-view email-view-empty">
      </div>
    )
  }

  const email = selectedEmail

  const formatFullDate = (date) => {
    if (!date) return ''
    return new Date(date).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  return (
    <div className="email-view animate-fade-in" key={email.id}>
      {/* Action Bar */}
      <div className="email-view-actions">
        <div className="email-view-actions-left">
          <Button variant="ghost" size="sm" icon="↩">Reply</Button>
          <Button variant="ghost" size="sm" icon="↪">Forward</Button>
          <Button variant="ghost" size="sm" icon="▤">Archive</Button>
          <Button variant="ghost" size="sm" icon="☆">Star</Button>
        </div>
        <div className="email-view-actions-right">
          <button
            className={`email-view-reader-toggle font-mono ${readerMode ? 'active' : ''}`}
            onClick={() => setReaderMode(!readerMode)}
            title="Toggle reader mode"
          >
            {readerMode ? '◉ reader' : '○ reader'}
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="email-view-header">
        <h1 className="email-view-subject">{email.subject || '(no subject)'}</h1>

        <div className="email-view-meta">
          <Avatar name={email.senderName} size={40} />
          <div className="email-view-meta-info">
            <div className="email-view-sender-row">
              <span className="email-view-sender">{email.senderName}</span>
              <button
                className="email-view-details-btn font-mono"
                onClick={() => setDetailsOpen(!detailsOpen)}
                title="Toggle sender details"
              >
                {detailsOpen ? '▲' : '▼'}
              </button>
            </div>
          </div>
          <div className="email-view-date font-mono">
            {formatFullDate(email.date)}
          </div>
        </div>

        {detailsOpen && (
          <div className="email-view-details-popup font-mono animate-fade-in">
            <div className="detail-row">
              <span className="detail-label">from:</span>
              <span className="detail-value">{email.senderName} &lt;{email.senderEmail}&gt;</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">to:</span>
              <span className="detail-value">{email.to || (user ? user.emailAddress : 'me')}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">date:</span>
              <span className="detail-value">{formatFullDate(email.date)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">subject:</span>
              <span className="detail-value">{email.subject || '(no subject)'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="email-view-body">
        {readerMode ? (
          <div className="email-view-reader">
            {email.bodyText || email.snippet}
          </div>
        ) : (
          email.bodyHtml ? (
            <div
              className="email-view-html"
              dangerouslySetInnerHTML={{ __html: email.bodyHtml }}
            />
          ) : (
            <div className="email-view-reader">
              {email.bodyText || email.snippet}
            </div>
          )
        )}
      </div>
    </div>
  )
}
