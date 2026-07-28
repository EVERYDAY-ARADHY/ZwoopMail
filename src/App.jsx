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
import TargetCursor from './components/shared/TargetCursor'

import './App.css'

function AppContent() {
  const {
    isAuthenticated, dispatch, categorizedEmails,
    accessToken, isLoading
  } = useMail()

  // Calculate email counts for sidebar
  const emailCounts = {}
  Object.entries(categorizedEmails).forEach(([key, emails]) => {
    emailCounts[key] = emails.length
  })

  // Handle Google Sign-In
  const handleSignIn = useCallback(async (token) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true })
      dispatch({ type: 'SET_ACCESS_TOKEN', payload: token })

      // Get user profile
      const profile = await getUserProfile(token)
      dispatch({ type: 'SET_USER', payload: profile })

      // Fetch emails
      const messageList = await listMessages(token, 30)
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
        // Fallback: put all in notifications
        const categorized = {
          people: emails.slice(0, 3),
          transactions: emails.slice(3, 6),
          newsletters: emails.slice(6, 8),
          notifications: emails.slice(8, 11),
          promotions: emails.slice(11),
        }
        dispatch({ type: 'SET_CATEGORIZED', payload: categorized })
      }
    } catch (err) {
      console.error('Sign in failed:', err)

      // Fallback to mock data for demo
      console.log('Using mock data for demo...')
      dispatch({ type: 'SET_USER', payload: { emailAddress: 'aradhy.demo@gmail.com' } })
      dispatch({ type: 'SET_CATEGORIZED', payload: categorizeMockEmails() })
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }, [dispatch])

  // Load mock data for development (when no Google client ID is configured)
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId && !isAuthenticated) {
      // No client ID set — show login screen; mock data loads on sign-in attempt
    }
  }, [isAuthenticated])

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
