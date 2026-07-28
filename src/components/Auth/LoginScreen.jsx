import { useState } from 'react'
import { useGoogleLogin } from '@react-oauth/google'
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

// Pure presentational layout — receives all state as props
function LoginLayout({ isLoading, error, previewEmails, buttonLabel, onButtonClick }) {
  return (
    <div className="login-screen">
      <div className="login-dots" aria-hidden="true" />

      <div className="login-3d-background-saver" aria-hidden="true">
        <AsciiSculpture
          modelPath="/models/angel_sculpture.glb"
          autoRotateSpeed={0.18}
          scaleMultiplier={3.4}
        />
      </div>

      <div className="login-content animate-fade-in">
        <pre className="login-logo">{LOGO_ART}</pre>

        <h1 className="login-title">Email, reimagined.</h1>
        <p className="login-subtitle">
          The calm, AI-powered inbox you deserve.<br />
          No clutter. No anxiety. Just your email.
        </p>

        <div className="login-cta">
          <Button
            variant="primary"
            onClick={onButtonClick}
            disabled={isLoading}
            icon="→"
          >
            {isLoading ? 'Connecting...' : buttonLabel}
          </Button>
        </div>

        {error && (
          <p className="login-error font-mono">{error}</p>
        )}

        {previewEmails && previewEmails.length > 0 && (
          <div style={{marginTop:'1rem', textAlign:'left', fontFamily:'monospace', fontSize:'0.75rem', opacity:0.8}}>
            <p style={{marginBottom:'0.5rem', color:'var(--color-accent, #a0d8ef)'}}>
              ✓ Auth verified — {previewEmails.length} emails fetched:
            </p>
            <ul style={{listStyle:'none', padding:0, margin:0}}>
              {previewEmails.map((m, i) => (
                <li key={m.id} style={{
                  padding:'0.35rem 0.5rem',
                  marginBottom:'0.25rem',
                  background:'rgba(255,255,255,0.05)',
                  borderLeft:'2px solid var(--color-accent, #a0d8ef)',
                  borderRadius:'2px',
                  lineHeight:1.4,
                }}>
                  <span style={{opacity:0.5}}>{i + 1}. </span>
                  {m.snippet || '(no snippet)'}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="login-credit font-mono">
          ┌─ forked from the chaos of legacy webmail ─┐<br/>
          │&nbsp;&nbsp;built for Overclock Delhi '26&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│<br/>
          └────────────────────────────────────────────┘
        </div>
      </div>
    </div>
  )
}

// OAuth variant — ONLY rendered inside a GoogleOAuthProvider tree
function OAuthLoginScreen({ onSignIn }) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [previewEmails, setPreviewEmails] = useState([])

  const login = useGoogleLogin({
    flow: 'implicit',
    scope: 'https://www.googleapis.com/auth/gmail.modify',
    onSuccess: async (tokenResponse) => {
      const token = tokenResponse.access_token
      setIsLoading(true)
      setError(null)
      try {
        const listRes = await fetch(
          'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=in:inbox',
          { headers: { Authorization: `Bearer ${token}` } }
        )
        const listData = await listRes.json()
        const ids = listData.messages || []
        const details = await Promise.all(
          ids.map(({ id }) =>
            fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`, {
              headers: { Authorization: `Bearer ${token}` },
            }).then(r => r.json())
          )
        )
        setPreviewEmails(details)
        await onSignIn(token)
      } catch (err) {
        setError(err.message || 'Failed to fetch emails')
        setIsLoading(false)
      }
    },
    onError: (err) => {
      setError('Google sign-in failed. Try again.')
      console.error(err)
    },
  })

  return (
    <LoginLayout
      isLoading={isLoading}
      error={error}
      previewEmails={previewEmails}
      buttonLabel="Sign in with Google"
      onButtonClick={() => { setError(null); login() }}
    />
  )
}

// Demo variant — no OAuth hooks at all; directly loads mock data
function DemoLoginScreen({ onSignIn }) {
  const [isLoading, setIsLoading] = useState(false)
  return (
    <LoginLayout
      isLoading={isLoading}
      error={null}
      previewEmails={[]}
      buttonLabel="Try Demo"
      onButtonClick={() => { setIsLoading(true); onSignIn(null) }}
    />
  )
}

// Check at module level — no hook, just env var inspection
const hasRealClientId = Boolean(
  import.meta.env.VITE_GOOGLE_CLIENT_ID &&
  import.meta.env.VITE_GOOGLE_CLIENT_ID.includes('.apps.googleusercontent.com')
)

export default function LoginScreen({ onSignIn }) {
  if (hasRealClientId) return <OAuthLoginScreen onSignIn={onSignIn} />
  return <DemoLoginScreen onSignIn={onSignIn} />
}
