import { useMail } from '../../context/MailContext'
import { STREAM_CONFIG } from '../shared/StreamBadge'
import './Sidebar.css'

const STREAMS = ['people', 'transactions', 'newsletters', 'notifications', 'promotions']

export default function Sidebar({ emailCounts = {} }) {
  const { activeStream, setActiveStream, toggleCompose, toggleTheme, theme, user } = useMail()

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <span className="sidebar-logo-icon">◉</span>
        <span className="sidebar-logo-text">ZWOOP</span>
      </div>

      {/* Compose Button */}
      <button className="sidebar-compose" onClick={toggleCompose}>
        <span>⊕</span> Compose
      </button>

      {/* Streams */}
      <div className="sidebar-section">
        <div className="sidebar-section-label">─── STREAMS ───</div>
        {STREAMS.map((stream) => {
          const config = STREAM_CONFIG[stream]
          const count = emailCounts[stream] || 0
          const isActive = activeStream === stream

          return (
            <button
              key={stream}
              className={`sidebar-stream ${isActive ? 'active' : ''}`}
              onClick={() => setActiveStream(stream)}
              style={{ '--stream-color': config.color }}
            >
              <span className="sidebar-stream-icon">{config.icon}</span>
              <span className="sidebar-stream-label">{config.label}</span>
              {count > 0 && (
                <span className="sidebar-stream-count">{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Quick Links */}
      <div className="sidebar-section">
        <div className="sidebar-section-label">─── QUICK ─────</div>
        <button className="sidebar-link">
          <span>☆</span> Starred
        </button>
        <button className="sidebar-link">
          <span>↗</span> Sent
        </button>
        <button className="sidebar-link">
          <span>▤</span> Drafts
        </button>
      </div>

      {/* Theme Toggle */}
      <div className="sidebar-footer">
        <button className="sidebar-theme-toggle" onClick={toggleTheme}>
          <span>{theme === 'light' ? '◐' : '◑'}</span>
          <span>{theme === 'light' ? 'Midnight' : 'Warm'}</span>
        </button>

        {user && (
          <div className="sidebar-user">
            <span className="sidebar-user-indicator">┌─</span>
            <span className="sidebar-user-email">{user.emailAddress}</span>
            <span className="sidebar-user-indicator">─┘</span>
          </div>
        )}
      </div>
    </aside>
  )
}
