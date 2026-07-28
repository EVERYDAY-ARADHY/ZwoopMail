import { useState } from 'react'
import { useMail } from '../../context/MailContext'
import Avatar from '../shared/Avatar'
import Button from '../shared/Button'
import EmptyState from '../shared/EmptyState'
import './EmailView.css'

export default function EmailView() {
  const { selectedEmail, accessToken } = useMail()
  const [readerMode, setReaderMode] = useState(false)

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
            <div className="email-view-sender">{email.senderName}</div>
            {email.senderEmail && email.senderEmail !== email.senderName && (
              <div className="email-view-sender-email font-mono">
                {email.senderEmail.startsWith('<') ? email.senderEmail : `<${email.senderEmail}>`}
              </div>
            )}
          </div>
          <div className="email-view-date font-mono">
            {formatFullDate(email.date)}
          </div>
        </div>
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
