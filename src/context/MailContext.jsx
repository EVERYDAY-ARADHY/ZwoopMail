import { createContext, useContext, useReducer, useCallback } from 'react'

const MailContext = createContext(null)

const initialState = {
  user: null,
  accessToken: null,
  isAuthenticated: false,
  emails: [],
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

  const selectEmail = useCallback((email) => {
    dispatch({ type: 'SELECT_EMAIL', payload: email })
  }, [])

  const toggleTheme = useCallback(() => {
    const newTheme = state.theme === 'light' ? 'dark' : 'light'
    dispatch({ type: 'SET_THEME', payload: newTheme })
    document.documentElement.setAttribute('data-theme', newTheme)
  }, [state.theme])

  const toggleCompose = useCallback(() => {
    dispatch({ type: 'SET_COMPOSING', payload: !state.isComposing })
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
