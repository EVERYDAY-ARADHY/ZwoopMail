import { useState, useEffect } from 'react'

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

const ASCII_LOADER_ART = `
┌──────────────────────────────────┐
│                                  │
│   ░░░░░░░░░░░░░░░████████████   │
│                                  │
└──────────────────────────────────┘
`

export default function AsciiLoader({ message = 'Loading', size = 'default' }) {
  const [frame, setFrame] = useState(0)
  const [barProgress, setBarProgress] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % FRAMES.length)
      setBarProgress((p) => (p >= 20 ? 0 : p + 1))
    }, 100)
    return () => clearInterval(interval)
  }, [])

  const bar = '█'.repeat(barProgress) + '░'.repeat(20 - barProgress)

  if (size === 'inline') {
    return (
      <span className="ascii-loader-inline font-mono" style={{ color: 'var(--color-ember)' }}>
        {FRAMES[frame]} {message}
      </span>
    )
  }

  return (
    <div className="ascii-loader" style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-16) 0',
      fontFamily: 'var(--font-mono)',
      color: 'var(--color-text-secondary)',
      fontSize: 'var(--text-sm)',
      gap: 'var(--space-4)',
      userSelect: 'none',
    }}>
      <div style={{ color: 'var(--color-ember)', fontSize: 'var(--text-xl)' }}>
        {FRAMES[frame]}
      </div>
      <pre style={{
        color: 'var(--color-text-tertiary)',
        fontSize: '11px',
        lineHeight: 1.4,
        textAlign: 'center',
      }}>
{`┌──────────────────────┐
│ ${bar} │
└──────────────────────┘`}
      </pre>
      <div style={{ letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '11px' }}>
        {message}...
      </div>
    </div>
  )
}
