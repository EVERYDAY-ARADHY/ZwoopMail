import { useState } from 'react'
import Button from '../shared/Button'
import AsciiSculpture from '../shared/AsciiSculpture'
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
      {/* Dot matrix canvas background (Layer 0) */}
      <div className="login-dots" aria-hidden="true" />

      {/* Atmospheric 3D ASCII Angel Sculpture Screensaver (Layer 1) 
          RAGE-PROOF FULL-SCREEN SHIELD: Container fills 100% of viewport while Three.js anchors 
          the massive 3.4x sculpture to the bottom left without a single clipped pixel! */}
      <div className="login-3d-background-saver" aria-hidden="true">
        <AsciiSculpture
          modelPath="/models/angel_sculpture.glb"
          autoRotateSpeed={0.18} // Serene museum speed
          scaleMultiplier={3.4} // Enormous colossal stature, zero clipping
        />
      </div>

      {/* Primary Content Card (Layer 10 - Fully formatted to the far right edge of the monitor!) */}
      <div className="login-content animate-fade-in">
        {/* ASCII Logo */}
        <pre className="login-logo">{LOGO_ART}</pre>

        {/* Tagline */}
        <h1 className="login-title">Email, reimagined.</h1>
        <p className="login-subtitle">
          The calm, AI-powered inbox you deserve.<br />
          No clutter. No anxiety. Just your email.
        </p>

        {/* Sign In CTA */}
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

        {/* Hackathon fork credit - cleanly right-aligned */}
        <div className="login-credit font-mono">
          ┌─ forked from the chaos of legacy webmail ─┐<br/>
          │&nbsp;&nbsp;built for Overclock Delhi '26&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│<br/>
          └────────────────────────────────────────────┘
        </div>
      </div>
    </div>
  )
}
