import { useState, useEffect, useCallback } from 'react'
import { MailProvider, useMail } from './context/MailContext'
import { getUserProfile, listMessages, getMessages } from './api/gmail'
import { categorizeEmails } from './api/ai'
import { categorizeMockEmails } from './utils/mockData'

import LoginScreen from './components/Auth/LoginScreen'
import Sidebar from './components/Layout/Sidebar'
import TopBar from './components/Layout/TopBar'
import EmailList from './components/EmailList/EmailList'
import EmailView from './components/EmailView/EmailView'
import Compose from './components/Compose/Compose'
import FloatingChat from './components/FloatingChat/FloatingChat'
import TargetCursor from './components/shared/TargetCursor'

import './App.css'

function AppContent() {
  const {
    isAuthenticated, dispatch, categorizedEmails,
    accessToken, isLoading
  } = useMail()

  const [isRestoring, setIsRestoring] = useState(() => {
    return Boolean(
      localStorage.getItem('zwoop_access_token') ||
      localStorage.getItem('zwoop_demo_mode') === 'true'
    )
  })

  // Calculate email counts for sidebar
  const emailCounts = {}
  Object.entries(categorizedEmails).forEach(([key, emails]) => {
    emailCounts[key] = emails.length
  })

  // Handle Google Sign-In
  const handleSignIn = useCallback(async (token) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true })
      if (!token) {
        // Direct Demo Mode sign-in
        localStorage.setItem('zwoop_demo_mode', 'true')
        localStorage.removeItem('zwoop_access_token')
        dispatch({ type: 'SET_USER', payload: { emailAddress: 'aradhy.demo@gmail.com' } })
        dispatch({ type: 'SET_CATEGORIZED', payload: categorizeMockEmails() })
        dispatch({ type: 'SET_LOADING', payload: false })
        setIsRestoring(false)
        return
      }

      // Get user profile first to validate token
      let profile
      try {
        profile = await getUserProfile(token)
      } catch (authError) {
        console.error('Token expired or invalid:', authError)
        localStorage.removeItem('zwoop_access_token')
        dispatch({ type: 'SET_LOADING', payload: false })
        setIsRestoring(false)
        return
      }

      dispatch({ type: 'SET_ACCESS_TOKEN', payload: token })
      dispatch({ type: 'SET_USER', payload: profile })
      localStorage.setItem('zwoop_access_token', token)
      localStorage.removeItem('zwoop_demo_mode')

      // Fetch emails (increased to 100 for richer categorized streams)
      try {
        const messageList = await listMessages(token, 100)
        const emails = await getMessages(token, messageList)
        dispatch({ type: 'SET_EMAILS', payload: emails })

        // AI categorize
        try {
          const categories = await categorizeEmails(emails)
          const categorized = {
            people: [],
            transactions: [],
            newsletters: [],
            notifications: [],
            promotions: [],
          }

          emails.forEach((email, i) => {
            const cat = categories[i] || 'notifications'
            email.category = cat
            categorized[cat].push(email)
          })

          dispatch({ type: 'SET_CATEGORIZED', payload: categorized })
        } catch {
          const categorized = {
            people: emails.slice(0, Math.ceil(emails.length / 5)),
            transactions: emails.slice(Math.ceil(emails.length / 5), Math.ceil(2 * emails.length / 5)),
            newsletters: emails.slice(Math.ceil(2 * emails.length / 5), Math.ceil(3 * emails.length / 5)),
            notifications: emails.slice(Math.ceil(3 * emails.length / 5), Math.ceil(4 * emails.length / 5)),
            promotions: emails.slice(Math.ceil(4 * emails.length / 5)),
          }
          dispatch({ type: 'SET_CATEGORIZED', payload: categorized })
        }
      } catch (emailFetchErr) {
        console.error('Email fetch encountered an issue after auth:', emailFetchErr)
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false })
        setIsRestoring(false)
      }
    } catch (err) {
      console.error('Sign in failed:', err)
      localStorage.removeItem('zwoop_access_token')
      dispatch({ type: 'SET_LOADING', payload: false })
      setIsRestoring(false)
    }
  }, [dispatch])

  // Restore authentication state across page refreshes
  useEffect(() => {
    if (isAuthenticated) {
      setIsRestoring(false)
      return
    }
    const savedToken = localStorage.getItem('zwoop_access_token')
    const isDemoMode = localStorage.getItem('zwoop_demo_mode') === 'true'

    if (savedToken) {
      handleSignIn(savedToken)
    } else if (isDemoMode) {
      handleSignIn(null)
    } else {
      setIsRestoring(false)
    }
  }, [isAuthenticated, handleSignIn])

  if (isRestoring) {
    return (
      <div style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg, #f5efe6)',
        color: 'var(--color-text, #18181a)',
        fontFamily: 'monospace',
        fontSize: '14px',
        letterSpacing: '0.05em'
      }}>
        ◉ Restoring session...
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginScreen onSignIn={handleSignIn} />
  }

  return (
    <div className="app-layout">
      <Sidebar emailCounts={emailCounts} />
      <main className="app-main">
        <TopBar />
        <div className="app-content">
          <EmailList />
          <EmailView />
        </div>
      </main>
      {/* Full screen compose AI overlay */}
      <Compose />
      {/* Instagram-style floating email DM chat widget */}
      <FloatingChat />
    </div>
  )
}

export default function App() {
  return (
    <MailProvider>
      <TargetCursor cursorColor="#fc5000" />
      <AppContent />
    </MailProvider>
  )
}
