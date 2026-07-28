import { createContext, useContext, useReducer, useCallback } from 'react'
import { markAsRead, markAsUnread, archiveMessage, starMessage } from '../api/gmail'

const MailContext = createContext(null)

const initialState = {
  user: null,
  accessToken: null,
  isAuthenticated: false,
  emails: [],
  archivedEmails: [],
  categorizedEmails: {
    people: [],
    transactions: [],
    newsletters: [],
    notifications: [],
    promotions: [],
  },
  needsAttention: [],
  activeStream: 'people',
  selectedEmail: null,
  isLoading: false,
  isComposing: false,
  theme: 'light',
  searchQuery: '',
  error: null,
}

function mailReducer(state, action) {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.payload, isAuthenticated: true }
    case 'SET_ACCESS_TOKEN':
      return { ...state, accessToken: action.payload }
    case 'SET_EMAILS':
      return { ...state, emails: action.payload, isLoading: false }
    case 'SET_CATEGORIZED':
      return { ...state, categorizedEmails: action.payload }
    case 'SET_NEEDS_ATTENTION':
      return { ...state, needsAttention: action.payload }
    case 'SET_ACTIVE_STREAM':
      return { ...state, activeStream: action.payload, selectedEmail: null }
    case 'SELECT_EMAIL':
      return { ...state, selectedEmail: action.payload }
    case 'MARK_AS_READ': {
      const emailId = action.payload
      const updatedEmails = state.emails.map((e) =>
        e.id === emailId ? { ...e, isUnread: false } : e
      )
      const updatedCategorized = {}
      Object.keys(state.categorizedEmails).forEach((key) => {
        updatedCategorized[key] = (state.categorizedEmails[key] || []).map((e) =>
          e.id === emailId ? { ...e, isUnread: false } : e
        )
      })
      const updatedSelected = state.selectedEmail && state.selectedEmail.id === emailId
        ? { ...state.selectedEmail, isUnread: false }
        : state.selectedEmail

      return {
        ...state,
        emails: updatedEmails,
        categorizedEmails: updatedCategorized,
        selectedEmail: updatedSelected,
      }
    }
    case 'MARK_AS_UNREAD': {
      const emailId = action.payload
      const updatedEmails = state.emails.map((e) =>
        e.id === emailId ? { ...e, isUnread: true } : e
      )
      const updatedCategorized = {}
      Object.keys(state.categorizedEmails).forEach((key) => {
        updatedCategorized[key] = (state.categorizedEmails[key] || []).map((e) =>
          e.id === emailId ? { ...e, isUnread: true } : e
        )
      })
      const updatedSelected = state.selectedEmail && state.selectedEmail.id === emailId
        ? { ...state.selectedEmail, isUnread: true }
        : state.selectedEmail

      return {
        ...state,
        emails: updatedEmails,
        categorizedEmails: updatedCategorized,
        selectedEmail: updatedSelected,
      }
    }
    case 'ARCHIVE_EMAIL': {
      const emailId = action.payload
      const archivedCandidate = state.emails.find((e) => e.id === emailId) || state.selectedEmail
      const updatedEmails = state.emails.filter((e) => e.id !== emailId)
      const updatedCategorized = {}
      Object.keys(state.categorizedEmails).forEach((key) => {
        updatedCategorized[key] = (state.categorizedEmails[key] || []).filter((e) => e.id !== emailId)
      })
      const currentList = updatedCategorized[state.activeStream] || []
      const nextSelected = currentList.length > 0 ? currentList[0] : null
      const nextArchived = archivedCandidate && !(state.archivedEmails || []).some(e => e.id === emailId)
        ? [...(state.archivedEmails || []), archivedCandidate]
        : (state.archivedEmails || [])
      return {
        ...state,
        emails: updatedEmails,
        archivedEmails: nextArchived,
        categorizedEmails: updatedCategorized,
        selectedEmail: state.selectedEmail && state.selectedEmail.id === emailId ? nextSelected : state.selectedEmail,
      }
    }
    case 'TOGGLE_STAR_EMAIL': {
      const emailId = action.payload
      const updatedEmails = state.emails.map((e) =>
        e.id === emailId ? { ...e, isStarred: !e.isStarred } : e
      )
      const updatedArchived = (state.archivedEmails || []).map((e) =>
        e.id === emailId ? { ...e, isStarred: !e.isStarred } : e
      )
      const updatedCategorized = {}
      Object.keys(state.categorizedEmails).forEach((key) => {
        updatedCategorized[key] = (state.categorizedEmails[key] || []).map((e) =>
          e.id === emailId ? { ...e, isStarred: !e.isStarred } : e
        )
      })
      const updatedSelected = state.selectedEmail && state.selectedEmail.id === emailId
        ? { ...state.selectedEmail, isStarred: !state.selectedEmail.isStarred }
        : state.selectedEmail

      return {
        ...state,
        emails: updatedEmails,
        archivedEmails: updatedArchived,
        categorizedEmails: updatedCategorized,
        selectedEmail: updatedSelected,
      }
    }
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }
    case 'SET_COMPOSING':
      return { ...state, isComposing: action.payload }
    case 'SET_THEME':
      return { ...state, theme: action.payload }
    case 'SET_SEARCH':
      return { ...state, searchQuery: action.payload }
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false }
    case 'LOGOUT':
      return { ...initialState }
    default:
      return state
  }
}

export function MailProvider({ children }) {
  const [state, dispatch] = useReducer(mailReducer, initialState)

  const setActiveStream = useCallback((stream) => {
    dispatch({ type: 'SET_ACTIVE_STREAM', payload: stream })
  }, [])

  const selectEmail = useCallback(async (email) => {
    dispatch({ type: 'SELECT_EMAIL', payload: email })
    if (email && email.isUnread) {
      dispatch({ type: 'MARK_AS_READ', payload: email.id })
      if (state.accessToken) {
        try {
          await markAsRead(state.accessToken, email.id)
        } catch (err) {
          console.error('Failed to mark email as read in Gmail API:', err)
        }
      }
    }
  }, [state.accessToken])

  const markAsUnreadEmail = useCallback(async (emailId) => {
    dispatch({ type: 'MARK_AS_UNREAD', payload: emailId })
    if (state.accessToken) {
      try {
        await markAsUnread(state.accessToken, emailId)
      } catch (err) {
        console.error('Failed to mark email as unread in Gmail:', err)
      }
    }
  }, [state.accessToken])

  const archiveEmail = useCallback(async (emailId) => {
    dispatch({ type: 'ARCHIVE_EMAIL', payload: emailId })
    if (state.accessToken) {
      try {
        await archiveMessage(state.accessToken, emailId)
      } catch (err) {
        console.error('Failed to archive email in Gmail API:', err)
      }
    }
  }, [state.accessToken])

  const toggleStarEmail = useCallback(async (email) => {
    dispatch({ type: 'TOGGLE_STAR_EMAIL', payload: email.id })
    if (state.accessToken && !email.isStarred) {
      try {
        await starMessage(state.accessToken, email.id)
      } catch (err) {
        console.error('Failed to star email in Gmail API:', err)
      }
    }
  }, [state.accessToken])

  const toggleTheme = useCallback(() => {
    const newTheme = state.theme === 'light' ? 'dark' : 'light'
    dispatch({ type: 'SET_THEME', payload: newTheme })
    document.documentElement.setAttribute('data-theme', newTheme)
  }, [state.theme])

  const toggleCompose = useCallback((initialData = null) => {
    if (state.isComposing) {
      dispatch({ type: 'SET_COMPOSING', payload: false })
    } else {
      dispatch({ type: 'SET_COMPOSING', payload: initialData || true })
    }
  }, [state.isComposing])

  const logout = useCallback(() => {
    localStorage.removeItem('zwoop_access_token')
    localStorage.removeItem('zwoop_demo_mode')
    dispatch({ type: 'LOGOUT' })
  }, [])

  const value = {
    ...state,
    dispatch,
    setActiveStream,
    selectEmail,
    markAsUnreadEmail,
    archiveEmail,
    toggleStarEmail,
    toggleTheme,
    toggleCompose,
    logout,
  }

  return (
    <MailContext.Provider value={value}>
      {children}
    </MailContext.Provider>
  )
}

export function useMail() {
  const context = useContext(MailContext)
  if (!context) {
    throw new Error('useMail must be used within a MailProvider')
  }
  return context
}
