import Avatar from '../shared/Avatar'
import './EmailItem.css'

export default function EmailItem({ email, isSelected, onClick }) {
  const formatDate = (date) => {
    if (!date) return ''
    const d = new Date(date)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()

    if (isToday) {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    }

    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    if (d.toDateString() === yesterday.toDateString()) {
      return 'Yesterday'
    }

    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const streamColors = {
    people: 'var(--stream-people)',
    transactions: 'var(--stream-transactions)',
    newsletters: 'var(--stream-newsletters)',
    notifications: 'var(--stream-notifications)',
    promotions: 'var(--stream-promotions)',
  }

  return (
    <button
      className={`email-item ${isSelected ? 'selected' : ''} ${email.isUnread ? 'unread' : ''}`}
      onClick={() => onClick(email)}
      style={{ '--item-stream-color': streamColors[email.category] || 'var(--color-border-strong)' }}
    >
      {/* Stream indicator bar */}
      <div className="email-item-indicator" />

      {/* Unread dot */}
      {email.isUnread && (
        <span className="email-item-unread-dot">◉</span>
      )}

      {/* Avatar */}
      <Avatar name={email.senderName} size={36} />

      {/* Content */}
      <div className="email-item-content">
        <div className="email-item-header">
          <span className="email-item-sender">
            {email.senderName}
          </span>
          <span className="email-item-date font-mono">
            {formatDate(email.date)}
          </span>
        </div>
        <div className="email-item-subject">
          {email.subject || '(no subject)'}
        </div>
      </div>
    </button>
  )
}
