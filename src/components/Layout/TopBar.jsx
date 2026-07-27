import { useState } from 'react'
import { useMail } from '../../context/MailContext'
import './TopBar.css'

export default function TopBar({ onSearch }) {
  const { searchQuery, dispatch } = useMail()
  const [inputValue, setInputValue] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    dispatch({ type: 'SET_SEARCH', payload: inputValue })
    onSearch?.(inputValue)
  }

  const handleClear = () => {
    setInputValue('')
    dispatch({ type: 'SET_SEARCH', payload: '' })
    onSearch?.('')
  }

  return (
    <header className="topbar">
      <form className="topbar-search" onSubmit={handleSubmit}>
        <span className="topbar-search-icon">⌕</span>
        <input
          type="text"
          className="topbar-search-input"
          placeholder="search emails..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          spellCheck={false}
        />
        {inputValue && (
          <button type="button" className="topbar-search-clear" onClick={handleClear}>
            ✕
          </button>
        )}
      </form>

      <div className="topbar-actions">
        <span className="topbar-shortcut font-mono">⌘K</span>
      </div>
    </header>
  )
}
