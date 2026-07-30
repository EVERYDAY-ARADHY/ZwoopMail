import { useState, useEffect, useRef } from 'react'
import { useMail } from '../../context/MailContext'
import { analyzePast5Emails, streamChatWithAI } from '../../api/ai'
import './AIChatModal.css'

export default function AIChatModal({ isOpen, onClose }) {
  const { emails, user } = useMail()
  const [activeTab, setActiveTab] = useState('summary') // 'summary' | 'chat'
  
  // Summary State
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [emailAnalysis, setEmailAnalysis] = useState([])
  const [hasAnalyzed, setHasAnalyzed] = useState(false)

  // Chat State
  const [messages, setMessages] = useState([])
  const [inputMessage, setInputMessage] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)
  const chatEndRef = useRef(null)

  // Fetch analysis when opening the summary tab for the first time
  useEffect(() => {
    if (isOpen && activeTab === 'summary' && !hasAnalyzed && emails.length > 0) {
      handleAnalyze()
    }
  }, [isOpen, activeTab, hasAnalyzed, emails])

  // Scroll to bottom of chat
  useEffect(() => {
    if (activeTab === 'chat' && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, activeTab])

  if (!isOpen) return null

  const handleAnalyze = async () => {
    setIsAnalyzing(true)
    try {
      const results = await analyzePast5Emails(emails)
      setEmailAnalysis(results)
      setHasAnalyzed(true)
    } catch (err) {
      console.error("Failed to analyze emails", err)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleSendMessage = async (e, text = inputMessage) => {
    if (e) e.preventDefault()
    if (!text.trim() || isChatLoading) return

    const newMessage = { id: Date.now().toString(), sender: 'user', text: text.trim() }
    const updatedMessages = [...messages, newMessage]
    setMessages(updatedMessages)
    setInputMessage('')
    setIsChatLoading(true)

    // Add empty assistant message that we will stream into
    const assistantMessageId = (Date.now() + 1).toString()
    setMessages(prev => [...prev, { id: assistantMessageId, sender: 'assistant', text: '' }])

    try {
      await streamChatWithAI(updatedMessages, emails.slice(0, 50), (chunk) => {
        setMessages(prev => {
          const newMessages = [...prev]
          const lastMsg = newMessages[newMessages.length - 1]
          if (lastMsg && lastMsg.id === assistantMessageId) {
            lastMsg.text += chunk
          }
          return newMessages
        })
      })
    } catch (err) {
      console.error("Chat streaming failed", err)
      setMessages(prev => {
        const newMessages = [...prev]
        const lastMsg = newMessages[newMessages.length - 1]
        if (lastMsg && lastMsg.id === assistantMessageId) {
          lastMsg.text = "Error: Failed to connect to AI. Please check API keys or network."
          lastMsg.isError = true
        }
        return newMessages
      })
    } finally {
      setIsChatLoading(false)
    }
  }

  const quickPrompts = [
    "Summarize my unread emails",
    "Any urgent action items today?",
    "Draft a polite decline to the last email",
    "Did I receive any OTPs recently?"
  ]

  return (
    <div className="ai-modal-backdrop" onClick={onClose}>
      <div className="ai-modal-container" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ai-modal-header">
          <div className="ai-modal-title">
            <span className="ai-sparkle-icon">✦</span>
            Zwoop Intelligence
            <span className="ai-model-badge">phi-mini</span>
          </div>
          <div className="ai-modal-tabs">
            <button 
              className={`ai-tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
              onClick={() => setActiveTab('summary')}
            >
              Inbox Analysis
            </button>
            <button 
              className={`ai-tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
              onClick={() => setActiveTab('chat')}
            >
              Ask AI
            </button>
          </div>
          <button className="ai-modal-close" onClick={onClose}>×</button>
        </div>

        {/* Tab 1: Summary */}
        {activeTab === 'summary' && (
          <div className="ai-summary-view">
            <div className="ai-summary-topbar">
              <div className="ai-summary-heading">
                <h3>Recent Inbox Activity</h3>
                <p>AI analysis of your 5 most recent emails</p>
              </div>
              <button className="ai-refresh-btn" onClick={handleAnalyze} disabled={isAnalyzing}>
                {isAnalyzing ? 'Analyzing...' : '↻ Refresh Analysis'}
              </button>
            </div>

            {isAnalyzing ? (
              <div className="ai-summary-loading">
                <div className="ai-spinner">✦</div>
                <p>Scanning recent emails for action items...</p>
              </div>
            ) : emailAnalysis.length > 0 ? (
              <div className="ai-priority-grid">
                {emailAnalysis.map((analysis, index) => {
                  const email = emails.find(e => e.id === analysis.id)
                  if (!email) return null
                  
                  return (
                    <div key={analysis.id || index} className="ai-priority-card">
                      <div className="card-header">
                        <span className="card-sender">{email.senderName || email.senderEmail}</span>
                        <span className={`urgency-pill ${analysis.urgency?.toLowerCase()}`}>
                          {analysis.urgency} Priority
                        </span>
                      </div>
                      <h4 className="card-subject">{email.subject}</h4>
                      <p className="card-summary">{analysis.summary}</p>
                      
                      {analysis.actionItem && analysis.actionItem.toLowerCase() !== "no action needed" && (
                        <div className="card-action-hint">
                          <span className="hint-label">Action:</span>
                          <span>{analysis.actionItem}</span>
                        </div>
                      )}
                      
                      <div className="card-footer-btns">
                        <button className="card-btn primary" onClick={() => {
                          // Jump to chat tab and ask to draft reply
                          setActiveTab('chat')
                          handleSendMessage(null, `Help me draft a reply to the email from ${email.senderName} regarding "${email.subject}"`)
                        }}>Draft Reply</button>
                        <button className="card-btn secondary" onClick={onClose}>View Mail</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="ai-summary-loading">
                <p>No emails found to analyze, or analysis failed.</p>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Chat */}
        {activeTab === 'chat' && (
          <div className="ai-chat-view">
            <div className="ai-quick-prompts">
              <span className="prompts-label">Quick actions:</span>
              {quickPrompts.map((prompt, i) => (
                <button 
                  key={i} 
                  className="prompt-pill"
                  onClick={() => handleSendMessage(null, prompt)}
                  disabled={isChatLoading}
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="ai-chat-messages">
              {messages.length === 0 && (
                <div className="ai-summary-loading" style={{ opacity: 0.5 }}>
                  <div className="ai-spinner" style={{ animation: 'none' }}>✦</div>
                  <p>Hi {user?.name?.split(' ')[0] || 'there'}! I can help you search, summarize, or draft emails.</p>
                </div>
              )}
              
              {messages.map((msg) => (
                <div key={msg.id} className={`ai-message-row ${msg.sender}`}>
                  {msg.sender === 'assistant' && (
                    <div className="ai-avatar-sparkle">✦</div>
                  )}
                  <div className="ai-message-body">
                    <div className={`ai-chat-bubble ${msg.isError ? 'ai-chat-error-banner' : ''}`}>
                      <div className="ai-markdown-content" style={{ whiteSpace: 'pre-wrap' }}>
                        {msg.text || (isChatLoading && msg.sender === 'assistant' ? (
                          <div className="loading">
                            <span className="typing-dot"></span>
                            <span className="typing-dot"></span>
                            <span className="typing-dot"></span>
                          </div>
                        ) : '')}
                      </div>
                    </div>
                    {msg.text && (
                      <span className="ai-msg-time">
                        {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <form className="ai-chat-footer" onSubmit={handleSendMessage}>
              <input 
                type="text" 
                className="ai-chat-input"
                placeholder="Ask Zwoop Intelligence..."
                value={inputMessage}
                onChange={e => setInputMessage(e.target.value)}
                disabled={isChatLoading}
              />
              <button 
                type="submit" 
                className="ai-send-btn"
                disabled={!inputMessage.trim() || isChatLoading}
              >
                {isChatLoading ? '⋯' : '➤'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
