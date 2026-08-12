import { useState } from 'react'
import { useMail } from '../../context/MailContext'
import { parseSearchQuery } from '../../api/ai'
import './TopBar.css'

// Version: increments by 1 per commit; tens digit flips every 10 commits.
// Update COMMIT_COUNT after each push to keep this current.
const COMMIT_COUNT = 57 // current commit will be 57 after this push
const APP_VERSION = `v0.${Math.floor(COMMIT_COUNT / 10)}.${COMMIT_COUNT % 10}`

export default function TopBar({ onSearch, onHamburgerClick, onOpenAI }) {
  const { searchQuery, dispatch, accessToken } = useMail()
  const [inputValue, setInputValue] = useState('')
  const [isParsing, setIsParsing] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const raw = inputValue.trim()
    if (!raw) return

    // Only run NLP parsing for authenticated (non-demo) users with a multi-word query
    const isNaturalLanguage = raw.includes(' ') || /[a-z]/i.test(raw)
    if (accessToken && isNaturalLanguage) {
      setIsParsing(true)
      try {
        const parsed = await parseSearchQuery(raw)
        // Use the AI-parsed Gmail query; fall back to the raw input if parsing fails
        const finalQuery = parsed?.trim() || raw
        dispatch({ type: 'SET_SEARCH', payload: finalQuery })
        onSearch?.(finalQuery)
      } catch {
        // Silently fall back to raw query on error
        dispatch({ type: 'SET_SEARCH', payload: raw })
        onSearch?.(raw)
      } finally {
        setIsParsing(false)
      }
    } else {
      dispatch({ type: 'SET_SEARCH', payload: raw })
      onSearch?.(raw)
    }
  }

  const handleClear = () => {
    setInputValue('')
    dispatch({ type: 'SET_SEARCH', payload: '' })
    onSearch?.('')
  }

  return (
    <header className="topbar">
      {/* Hamburger menu — visible only on mobile */}
      <button
        className="topbar-hamburger"
        onClick={onHamburgerClick}
        aria-label="Open sidebar menu"
        type="button"
      >
        <span className="hamburger-line" />
        <span className="hamburger-line" />
        <span className="hamburger-line" />
      </button>

      <form className="topbar-search" onSubmit={handleSubmit}>
        <span className="topbar-search-icon" style={isParsing ? { animation: 'spin 0.8s linear infinite', display: 'inline-block' } : {}}>
          {isParsing ? '◉' : '⌕'}
        </span>
        <input
          type="text"
          className="topbar-search-input"
          placeholder={isParsing ? 'Parsing with AI...' : 'search emails... (press ↵ for AI search)'}
          value={inputValue}
          disabled={isParsing}
          onChange={(e) => {
            setInputValue(e.target.value)
            dispatch({ type: 'SET_SEARCH', payload: e.target.value })
            onSearch?.(e.target.value)
          }}
          spellCheck={false}
        />
        {inputValue && !isParsing && (
          <button type="button" className="topbar-search-clear" onClick={handleClear}>
            ✕
          </button>
        )}
      </form>

      <div className="topbar-actions">
        <span className="topbar-version font-mono" title={`ZwoopMail ${APP_VERSION}`}>{APP_VERSION}</span>
        <button 
          className="topbar-ask-ai-btn"
          onClick={onOpenAI}
          title="Open Zwoop Intelligence"
        >
          <span className="ai-sparkle">✦</span> Ask AI
        </button>
      </div>
    </header>
  )
}
