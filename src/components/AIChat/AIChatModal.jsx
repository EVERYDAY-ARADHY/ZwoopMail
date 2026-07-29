import { useState, useEffect, useRef } from 'react'
import { useMail } from '../../context/MailContext'
import { chatWithAI, generatePrioritySummary } from '../../api/ai'
import { parseAICommands, executeAICommand } from '../../utils/aiCommandDispatcher'
import Avatar from '../shared/Avatar'
import './AIChatModal.css'

export default function AIChatModal({ isOpen, onClose }) {
  const mailContext = useMail()
  const { emails, selectedEmail, user, toggleCompose, selectEmail, setActiveStream, dispatch, archiveEmail, toggleStarEmail } = mailContext

  const [activeTab, setActiveTab] = useState('summary') // 'summary' | 'chat'
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hello! I am **Zwoop AI** powered by Gemini. How can I assist you with your inbox today?",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
  ])
  const [inputQuery, setInputQuery] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [lastError, setLastError] = useState(null)
  
  // Priority Summary state
  const [priorityCards, setPriorityCards] = useState([])
  const [isLoadingSummary, setIsLoadingSummary] = useState(false)
  const [summaryError, setSummaryError] = useState(null)

  const messagesEndRef = useRef(null)

  // Fetch / Generate Priority Summary whenever modal opens or tab changes to summary
  useEffect(() => {
    if (isOpen && emails.length > 0 && priorityCards.length === 0) {
      handleFetchSummary()
    }
  }, [isOpen, emails.length])

  // Scroll to bottom of chat
  useEffect(() => {
    if (activeTab === 'chat' && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [activeTab, messages, isGenerating])

  if (!isOpen) return null

  const handleFetchSummary = async () => {
    setIsLoadingSummary(true)
    setSummaryError(null)
    try {
      const result = await generatePrioritySummary(emails)
      setPriorityCards(result || [])
    } catch (err) {
      setSummaryError(err.message || 'Failed to generate priority summary.')
    } finally {
      setIsLoadingSummary(false)
    }
  }

  const handleSendMessage = async (customPrompt = null) => {
    const textToSend = customPrompt || inputQuery
    if (!textToSend.trim() || isGenerating) return

    setLastError(null)
    const userMsg = {
      role: 'user',
      content: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    const updatedHistory = [...messages, userMsg]
    setMessages(updatedHistory)
    if (!customPrompt) setInputQuery('')
    setIsGenerating(true)

    try {
      // Format messages for API
      const apiMessages = updatedHistory.map(m => ({
        role: m.role,
        content: m.content
      }))

      const rawAiResponse = await chatWithAI({
        messages: apiMessages,
        emails,
        selectedEmail,
        user
      })

      // Parse commands
      const { cleanText, commands } = parseAICommands(rawAiResponse)

      // Execute commands on website
      const executedResults = []
      if (commands.length > 0) {
        for (const cmd of commands) {
          const res = await executeAICommand(cmd, {
            toggleCompose,
            selectEmail,
            setActiveStream,
            dispatch,
            emails,
            selectedEmail,
            archiveEmail,
            toggleStarEmail
          })
          executedResults.push({ cmd, result: res })
        }
      }

      // Check if any matching emails were mentioned
      const matchedEmails = findMatchingEmails(cleanText, emails)

      const assistantMsg = {
        role: 'assistant',
        content: cleanText || (commands.length > 0 ? "I've executed your command." : "Processed request."),
        executedResults,
        matchedEmails,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }

      setMessages(prev => [...prev, assistantMsg])

    } catch (err) {
      console.error('AI Chat Error:', err)
      const errorObj = {
        title: err.title || 'Gemini API Error',
        status: err.status || 500,
        message: err.message || 'An unexpected error occurred while communicating with Gemini.',
      }
      setLastError(errorObj)

      // Also append error block into chat stream
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          isError: true,
          errorObj,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ])
    } finally {
      setIsGenerating(false)
    }
  }

  // Find matching email objects referenced in text snippets
  function findMatchingEmails(text, allEmails) {
    if (!text || !allEmails.length) return []
    const found = []
    allEmails.forEach(e => {
      if (e.id && text.includes(e.id)) {
        found.push(e)
      } else if (e.subject && e.subject.length > 5 && text.toLowerCase().includes(e.subject.toLowerCase())) {
        if (!found.some(f => f.id === e.id)) found.push(e)
      }
    })
    return found.slice(0, 3)
  }

  const handleAskAboutEmail = (card) => {
    setActiveTab('chat')
    handleSendMessage(`Tell me more about the email from ${card.senderName} regarding "${card.subject}" and help me reply.`)
  }

  return (
    <div className="ai-modal-backdrop" onClick={onClose}>
      <div className="ai-modal-container animate-fade-in" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ai-modal-header">
          <div className="ai-modal-title">
            <span className="ai-sparkle-icon">✦</span>
            <span>ZWOOP GEMINI AI</span>
            <span className="ai-model-badge">gemini-2.0-flash</span>
          </div>

          <div className="ai-modal-tabs">
            <button
              className={`ai-tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
              onClick={() => setActiveTab('summary')}
            >
              <span>📊 High Priority Summary</span>
            </button>
            <button
              className={`ai-tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
              onClick={() => setActiveTab('chat')}
            >
              <span>💬 AI Chat & Actions</span>
            </button>
          </div>

          <button className="ai-modal-close" onClick={onClose} title="Close AI Assistant">
            ×
          </button>
        </div>

        {/* TAB 1: SUMMARY SECTION */}
        {activeTab === 'summary' && (
          <div className="ai-summary-view">
            <div className="ai-summary-topbar">
              <div className="ai-summary-heading">
                <h3>⚡ Actionable Email Digest</h3>
                <p>AI-detected urgent messages, questions, and action items from your inbox</p>
              </div>
              <button
                className="ai-refresh-btn"
                onClick={handleFetchSummary}
                disabled={isLoadingSummary}
              >
                {isLoadingSummary ? '↻ Analyzing...' : '↻ Refresh Scan'}
              </button>
            </div>

            {isLoadingSummary && (
              <div className="ai-summary-loading">
                <div className="ai-spinner">✦</div>
                <p>Gemini AI is scanning your loaded messages for high priority items...</p>
              </div>
            )}

            {summaryError && (
              <div className="ai-error-box">
                <span className="error-icon">⚠️</span>
                <div>
                  <strong>Priority Summary Notice:</strong> {summaryError}
                </div>
              </div>
            )}

            {!isLoadingSummary && !summaryError && priorityCards.length === 0 && (
              <div className="ai-summary-empty">
                <span>✨</span>
                <p>All caught up! No urgent high-priority emails requiring immediate action right now.</p>
              </div>
            )}

            {!isLoadingSummary && priorityCards.length > 0 && (
              <div className="ai-priority-grid">
                {priorityCards.map((card, idx) => {
                  const matchingMail = emails.find(e => e.id === card.id)
                  return (
                    <div key={card.id || idx} className="ai-priority-card">
                      <div className="card-header">
                        <span className={`urgency-pill ${card.urgency?.toLowerCase() || 'high'}`}>
                          {card.urgency || 'High Priority'}
                        </span>
                        <span className="card-sender">{card.senderName}</span>
                      </div>

                      <h4 className="card-subject">{card.subject}</h4>
                      <p className="card-summary">{card.summary}</p>

                      {card.suggestedAction && (
                        <div className="card-action-hint">
                          <span className="hint-label">Suggested Action:</span>
                          <span>{card.suggestedAction}</span>
                        </div>
                      )}

                      <div className="card-footer-btns">
                        <button
                          className="card-btn primary"
                          onClick={() => {
                            if (toggleCompose) {
                              toggleCompose({
                                to: matchingMail?.senderEmail || card.senderName,
                                subject: card.subject?.startsWith('Re:') ? card.subject : `Re: ${card.subject || ''}`,
                                body: ''
                              })
                              onClose()
                            }
                          }}
                        >
                          ✎ Quick Reply
                        </button>

                        <button
                          className="card-btn secondary"
                          onClick={() => {
                            if (matchingMail && selectEmail) {
                              selectEmail(matchingMail)
                              onClose()
                            }
                          }}
                        >
                          ↗ View Mail
                        </button>

                        <button
                          className="card-btn tertiary"
                          onClick={() => handleAskAboutEmail(card)}
                        >
                          ⚡ Chat AI
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CHAT SECTION */}
        {activeTab === 'chat' && (
          <div className="ai-chat-view">
            {/* Prompt Quick Starters */}
            <div className="ai-quick-prompts">
              <span className="prompts-label">Quick Actions:</span>
              <button
                className="prompt-pill"
                onClick={() => handleSendMessage("Summarize my high priority emails and tell me what needs attention")}
              >
                📊 Summarize Priority Mails
              </button>
              <button
                className="prompt-pill"
                onClick={() => handleSendMessage("Compose a professional email asking for a status update on project deliverables")}
              >
                ✉ Compose Status Request
              </button>
              <button
                className="prompt-pill"
                onClick={() => handleSendMessage("Show me all unread emails from the people stream")}
              >
                🔍 Filter Unread People Mails
              </button>
            </div>

            {/* Chat Thread */}
            <div className="ai-chat-messages">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`ai-message-row ${msg.role === 'user' ? 'user' : 'assistant'}`}
                >
                  <div className="ai-message-avatar">
                    {msg.role === 'user' ? (
                      <Avatar name={user?.emailAddress || 'Me'} size="sm" />
                    ) : (
                      <div className="ai-avatar-sparkle">✦</div>
                    )}
                  </div>

                  <div className="ai-message-body">
                    {msg.isError ? (
                      /* Server / API Error Diagnostic Box */
                      <div className="ai-chat-error-banner animate-fade-in">
                        <div className="error-banner-header">
                          <span className="error-badge">SERVER ERROR</span>
                          <span className="error-status">HTTP {msg.errorObj?.status || '500'}</span>
                        </div>
                        <h4 className="error-title">{msg.errorObj?.title || 'Gemini API Failure'}</h4>
                        <p className="error-details">{msg.errorObj?.message}</p>
                        <button
                          className="error-retry-btn"
                          onClick={() => handleSendMessage("Retry previous request")}
                        >
                          ↻ Retry Command
                        </button>
                      </div>
                    ) : (
                      <div className="ai-chat-bubble">
                        {/* Message Content */}
                        <div className="ai-markdown-content">
                          {msg.content.split('\n').map((line, lIdx) => (
                            <p key={lIdx}>{line}</p>
                          ))}
                        </div>

                        {/* Direct Matched Mail Cards Embed inside Chat */}
                        {msg.matchedEmails && msg.matchedEmails.length > 0 && (
                          <div className="ai-chat-mail-embeds">
                            <span className="embeds-title">Direct Mail References:</span>
                            {msg.matchedEmails.map(mail => (
                              <div
                                key={mail.id}
                                className="chat-mail-card"
                                onClick={() => {
                                  if (selectEmail) selectEmail(mail)
                                  onClose()
                                }}
                              >
                                <div className="chat-mail-header">
                                  <strong>{mail.senderName}</strong>
                                  <span className="chat-mail-date">{mail.date || 'Recent'}</span>
                                </div>
                                <div className="chat-mail-sub">{mail.subject}</div>
                                <div className="chat-mail-snippet">{mail.snippet?.slice(0, 100)}...</div>
                                <div className="chat-mail-action">Click to view in Mail panel ↗</div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Executed Action Badges */}
                        {msg.executedResults && msg.executedResults.length > 0 && (
                          <div className="ai-command-execution-badges">
                            {msg.executedResults.map((item, eIdx) => (
                              <div
                                key={eIdx}
                                className={`command-badge ${item.result.success ? 'success' : 'failed'}`}
                              >
                                <span>{item.result.success ? '⚡ Executed Command:' : '⚠️ Command Failed:'}</span>
                                <span>{item.result.message}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <span className="ai-msg-time">{msg.timestamp}</span>
                  </div>
                </div>
              ))}

              {isGenerating && (
                <div className="ai-message-row assistant">
                  <div className="ai-message-avatar">
                    <div className="ai-avatar-sparkle animate-pulse">✦</div>
                  </div>
                  <div className="ai-chat-bubble loading">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="loading-text">Gemini is processing & executing commands...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Footer */}
            <form className="ai-chat-footer" onSubmit={e => { e.preventDefault(); handleSendMessage(); }}>
              <input
                type="text"
                className="ai-chat-input"
                placeholder="Ask Gemini to compose, reply, summarize, filter emails..."
                value={inputQuery}
                onChange={e => setInputQuery(e.target.value)}
                disabled={isGenerating}
              />
              <button
                type="submit"
                className="ai-send-btn"
                disabled={!inputQuery.trim() || isGenerating}
              >
                {isGenerating ? '⋯' : '➤'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
