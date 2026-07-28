const STREAM_CONFIG = {
  people: { label: 'People', icon: '●', color: 'var(--stream-people)' },
  transactions: { label: 'Transactions', icon: '◆', color: 'var(--stream-transactions)' },
  newsletters: { label: 'Newsletters', icon: '▤', color: 'var(--stream-newsletters)' },
  notifications: { label: 'Notifications', icon: '✦', color: 'var(--stream-notifications)' },
  promotions: { label: 'Promotions', icon: '▻', color: 'var(--stream-promotions)' },
  starred: { label: 'Starred', icon: '☆', color: '#f5c800' },
  archived: { label: 'Archived', icon: '▤', color: 'var(--color-text-secondary)' },
  sent: { label: 'Sent', icon: '↗', color: 'var(--color-plasma-violet)' },
  drafts: { label: 'Drafts', icon: '✎', color: 'var(--stream-notifications)' },
}

export default function StreamBadge({ stream, count = null, compact = false }) {
  const config = STREAM_CONFIG[stream]
  if (!config) return null

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: compact ? '4px' : '6px',
      padding: compact ? '2px 8px' : '4px 12px',
      borderRadius: 'var(--radius-pill)',
      backgroundColor: `color-mix(in srgb, ${config.color} 12%, transparent)`,
      color: config.color,
      fontFamily: 'var(--font-mono)',
      fontSize: compact ? '11px' : 'var(--text-xs)',
      fontWeight: 'var(--weight-medium)',
      letterSpacing: '0.03em',
      lineHeight: 1,
      whiteSpace: 'nowrap',
      userSelect: 'none',
    }}>
      <span style={{ fontSize: compact ? '10px' : '11px' }}>{config.icon}</span>
      {!compact && <span>{config.label}</span>}
      {count !== null && count > 0 && (
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          opacity: 0.8,
        }}>
          {count}
        </span>
      )}
    </span>
  )
}

export { STREAM_CONFIG }
