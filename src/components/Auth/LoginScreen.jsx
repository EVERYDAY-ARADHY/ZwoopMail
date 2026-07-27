import { useState } from 'react'
import Button from '../shared/Button'
import './LoginScreen.css'

const LOGO_ART = `
╔════════════════════════════════════════════════════════╗
║                                                        ║
║    ███████╗ ██╗    ██╗  ██████╗   ██████╗  ██████╗     ║
║    ╚══███╔╝ ██║    ██║ ██╔═══██╗ ██╔═══██╗ ██╔══██╗    ║
║      ███╔╝  ██║ █╗ ██║ ██║   ██║ ██║   ██║ ██████╔╝    ║
║     ███╔╝   ██║███╗██║ ██║   ██║ ██║   ██║ ██╔═══╝     ║
║    ███████╗ ╚███╔███╔╝ ╚██████╔╝ ╚██████╔╝ ██║         ║
║    ╚══════╝  ╚══╝╚══╝   ╚═════╝   ╚═════╝  ╚═╝         ║
║                                                        ║
║                ━━━━━  M  A  I  L  ━━━━━                ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
`

export default function LoginScreen({ onSignIn }) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSignIn = async () => {
    setIsLoading(true)
    setError(null)
    try {
      await onSignIn()
    } catch (err) {
      setError(err.message || 'Sign in failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="login-screen">
      {/* Dot matrix background */}
      <div className="login-dots" aria-hidden="true" />

      <div className="login-content animate-fade-in">
        {/* ASCII Logo */}
        <pre className="login-logo">{LOGO_ART}</pre>

        {/* Tagline */}
        <h1 className="login-title">Email, reimagined.</h1>
        <p className="login-subtitle">
          The calm, AI-powered inbox you deserve.<br />
          No clutter. No anxiety. Just your email.
        </p>

        {/* Sign In */}
        <div className="login-cta">
          <Button
            variant="primary"
            onClick={handleSignIn}
            disabled={isLoading}
            icon="→"
          >
            {isLoading ? 'Connecting...' : 'Sign in with Google'}
          </Button>
        </div>

        {error && (
          <p className="login-error font-mono">{error}</p>
        )}

        {/* Features */}
        <div className="login-features font-mono">
          <div className="login-feature">
            <span className="login-feature-icon">◉</span>
            <span>AI-powered stream sorting</span>
          </div>
          <div className="login-feature">
            <span className="login-feature-icon">◉</span>
            <span>Smart priority detection</span>
          </div>
          <div className="login-feature">
            <span className="login-feature-icon">◉</span>
            <span>Beautiful compose with tone assist</span>
          </div>
        </div>

        {/* Fork credit */}
        <div className="login-credit font-mono">
          ┌─ forked from the chaos of legacy webmail ─┐<br/>
          │&nbsp;&nbsp;built for Overclock Delhi '26&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│<br/>
          └────────────────────────────────────────────┘
        </div>
      </div>
    </div>
  )
}
