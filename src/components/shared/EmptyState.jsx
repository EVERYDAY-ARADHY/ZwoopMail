const EMPTY_ART = `
    ╔══════════════════════════╗
    ║                          ║
    ║     ◇  ALL CLEAR  ◇     ║
    ║                          ║
    ║   No emails need your    ║
    ║       attention.         ║
    ║                          ║
    ║   Go touch some grass.   ║
    ║                          ║
    ╚══════════════════════════╝
`

const STREAM_EMPTY = {
  people: {
    art: `
  ┌────────────────────┐
  │   ◯               │
  │  ╱│╲   No humans   │
  │   │    wrote you.  │
  │  ╱ ╲              │
  └────────────────────┘`,
    message: 'No personal emails right now',
  },
  transactions: {
    art: `
  ┌────────────────────┐
  │   ┌───┐            │
  │   │ $ │  No orders │
  │   └───┘  or bills. │
  │                    │
  └────────────────────┘`,
    message: 'No transactions to track',
  },
  newsletters: {
    art: `
  ┌────────────────────┐
  │   ╔═╗              │
  │   ║≡║  No blogs    │
  │   ╚═╝  or digests. │
  │                    │
  └────────────────────┘`,
    message: 'Newsletter feed is empty',
  },
  notifications: {
    art: `
  ┌────────────────────┐
  │   ┌─┐              │
  │   │!│  No alerts   │
  │   └─┘  to show.   │
  │                    │
  └────────────────────┘`,
    message: 'All quiet on the notification front',
  },
  promotions: {
    art: `
  ┌────────────────────┐
  │   ╔═══╗            │
  │   ║ % ║  No deals  │
  │   ╚═══╝  today.    │
  │                    │
  └────────────────────┘`,
    message: 'Your wallet is safe',
  },
}

export default function EmptyState({ stream = null }) {
  const content = stream ? STREAM_EMPTY[stream] : null

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-16) var(--space-8)',
      minHeight: '300px',
      userSelect: 'none',
    }}>
      <pre style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '13px',
        lineHeight: 1.5,
        color: 'var(--color-text-tertiary)',
        textAlign: 'center',
        whiteSpace: 'pre',
      }}>
        {content ? content.art : EMPTY_ART}
      </pre>
      {content && (
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-tertiary)',
          marginTop: 'var(--space-4)',
          letterSpacing: '0.05em',
        }}>
          {content.message}
        </p>
      )}
    </div>
  )
}
