/**
 * Avatar component — generates a colored initial avatar for senders
 * Uses the sender's name to deterministically pick a warm color.
 */

const AVATAR_COLORS = [
  '#fc5000', '#524ae9', '#2d8a4e', '#e6a817', '#c44dff',
  '#e05252', '#3b82f6', '#14b8a6', '#f97316', '#8b5cf6',
]

function hashString(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
    hash = hash & hash
  }
  return Math.abs(hash)
}

export default function Avatar({ name = '', size = 36 }) {
  const initial = name.charAt(0).toUpperCase() || '?'
  const colorIndex = hashString(name) % AVATAR_COLORS.length
  const bgColor = AVATAR_COLORS[colorIndex]

  return (
    <div style={{
      width: `${size}px`,
      height: `${size}px`,
      minWidth: `${size}px`,
      borderRadius: 'var(--radius-xl)',
      backgroundColor: bgColor,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-body)',
      fontWeight: 'var(--weight-semibold)',
      fontSize: `${size * 0.42}px`,
      color: '#ffffff',
      userSelect: 'none',
      lineHeight: 1,
    }}>
      {initial}
    </div>
  )
}
