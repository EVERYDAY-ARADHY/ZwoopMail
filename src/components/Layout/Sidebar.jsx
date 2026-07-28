import { useState, useRef, useEffect } from 'react'
import { useMail } from '../../context/MailContext'
import { STREAM_CONFIG } from '../shared/StreamBadge'
import './Sidebar.css'

const STREAMS = ['people', 'transactions', 'newsletters', 'notifications', 'promotions']

export default function Sidebar({ emailCounts = {} }) {
  const { activeStream, setActiveStream, toggleCompose, toggleTheme, theme, user, logout, accessToken } = useMail()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
        <button
          className={`sidebar-link ${activeStream === 'starred' ? 'active' : ''}`}
          onClick={() => setActiveStream('starred')}
        >
          <span>☆</span> Starred
        </button>
        <button
          className={`sidebar-link ${activeStream === 'archived' ? 'active' : ''}`}
          onClick={() => setActiveStream('archived')}
        >
          <span>▤</span> Archived
        </button>
        <button
          className={`sidebar-link ${activeStream === 'sent' ? 'active' : ''}`}
          onClick={() => setActiveStream('sent')}
        >
          <span>↗</span> Sent
        </button>
        <button
          className={`sidebar-link ${activeStream === 'drafts' ? 'active' : ''}`}
          onClick={() => setActiveStream('drafts')}
        >
          <span>✎</span> Drafts
        </button>
      </div>

      {/* Footer & User Area */}
      <div className="sidebar-footer" ref={menuRef}>
        <button className="sidebar-theme-toggle" onClick={toggleTheme}>
          <span>{theme === 'light' ? '◐' : '◑'}</span>
          <span>{theme === 'light' ? 'Midnight' : 'Warm'}</span>
        </button>

        {user && (
          <div className="sidebar-user-container">
            {userMenuOpen && (
              <div className="sidebar-user-menu animate-fade-in">
                <div className="user-menu-header">
                  <div className="user-menu-status">
                    <span className="status-dot">◉</span>
                    {accessToken ? 'Gmail Connected' : 'Demo Account'}
                  </div>
                  <div className="user-menu-email">{user.emailAddress}</div>
                </div>
                <div className="user-menu-divider" />
                <button
                  className="user-menu-item"
                  onClick={() => {
                    setUserMenuOpen(false)
                    alert("ZwoopMail v1.0 • Overclock Delhi '26\nAI models running optimized zero-latency categorization.")
                  }}
                >
                  <span>⚙</span> AI Settings & Status
                </button>
                <button
                  className="user-menu-item"
                  onClick={() => {
                    setUserMenuOpen(false)
                    toggleTheme()
                  }}
                >
                  <span>{theme === 'light' ? '◐' : '◑'}</span> Switch to {theme === 'light' ? 'Dark' : 'Light'} Theme
                </button>
                <div className="user-menu-divider" />
                <button
                  className="user-menu-item logout-btn"
                  onClick={() => {
                    setUserMenuOpen(false)
                    logout()
                  }}
                >
                  <span>⏻</span> Log Out
                </button>
              </div>
            )}

            <button
              className={`sidebar-user-btn ${userMenuOpen ? 'active' : ''}`}
              onClick={() => setUserMenuOpen(!userMenuOpen)}
            >
              <span className="sidebar-user-indicator">┌─</span>
              <span className="sidebar-user-email">{user.emailAddress}</span>
              <span className="sidebar-user-indicator">▲</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}

