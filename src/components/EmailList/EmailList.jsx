import { useMail } from '../../context/MailContext'
import EmailItem from './EmailItem'
import EmptyState from '../shared/EmptyState'
import AsciiLoader from '../shared/AsciiLoader'
import NeedsAttention from './NeedsAttention'
import { STREAM_CONFIG } from '../shared/StreamBadge'
import './EmailList.css'

export default function EmailList() {
  const { categorizedEmails, activeStream, selectEmail, selectedEmail, isLoading } = useMail()

  const emails = categorizedEmails[activeStream] || []
  const config = STREAM_CONFIG[activeStream]

  if (isLoading) {
    return (
      <div className="email-list">
        <AsciiLoader message="Fetching emails" />
      </div>
    )
  }

  return (
    <div className="email-list">
      {/* Stream Header */}
      <div className="email-list-header">
        <div className="email-list-stream-info">
          <span className="email-list-stream-icon">{config?.icon}</span>
          <h2 className="email-list-stream-name font-display">{config?.label}</h2>
          <span className="email-list-count font-mono">{emails.length}</span>
        </div>
      </div>

      {/* AI Urgent Attention Priority Bar */}
      <NeedsAttention />

      {/* Email Items */}
      {emails.length === 0 ? (
        <EmptyState stream={activeStream} />
      ) : (
        <div className="email-list-items stagger-children">
          {emails.map((email) => (
            <EmailItem
              key={email.id}
              email={email}
              isSelected={selectedEmail?.id === email.id}
              onClick={selectEmail}
            />
          ))}
        </div>
      )}
    </div>
  )
}
