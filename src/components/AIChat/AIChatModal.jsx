import { useState, useEffect, useRef } from 'react'
import { useMail } from '../../context/MailContext'
import { analyzeTodaysEmails, streamChatWithAI, retrieveRelevantEmailIds } from '../../api/ai'
import './AIChatModal.css'

export default function AIChatModal({ isOpen, onClose }) {
  const { emails, user, toggleCompose, setSelectedEmail } = useMail()
  const [activeTab, setActiveTab] = useState('summary') // 'summary' | 'chat'
  
  // Summary State
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [emailAnalysis, setEmailAnalysis] = useState([])
  const [hasAnalyzed, setHasAnalyzed] = useState(false)

  // Chat State
  const [messages, setMessages] = useState([])
  const [inputMessage, setInputMessage] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [useDeepSearch, setUseDeepSearch] = useState(false)
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
      const results = await analyzeTodaysEmails(emails)
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

    let relevantEmails = emails.slice(0, 5) // default context
    let messageSources = []

    if (useDeepSearch && emails.length > 0) {
      // Step 1: Tell user we are searching
      const searchingMsgId = Date.now().toString() + '_search'
      setMessages(prev => [...prev, { id: searchingMsgId, sender: 'assistant', text: 'Searching through last 30 emails...', isSearch: true }])
      
      try {
        const targetCount = Math.min(30, emails.length)
        const lightWeightEmails = emails.slice(0, targetCount).map(e => ({
          id: e.id,
          subject: e.subject,
          sender: e.senderName,
          date: e.date
        }))
        
        const relevantIds = await retrieveRelevantEmailIds(text.trim(), lightWeightEmails)
        if (relevantIds && relevantIds.length > 0) {
          relevantEmails = emails.filter(e => relevantIds.includes(e.id))
          messageSources = relevantEmails.map(e => ({ id: e.id, subject: e.subject, senderName: e.senderName, email: e }))
        }
      } catch (err) {
        console.error("Deep search retrieval failed:", err)
      }
      
      // Remove searching message
      setMessages(prev => prev.filter(m => m.id !== searchingMsgId))
    }

    // Add empty assistant message that we will stream into
    const assistantMessageId = (Date.now() + 1).toString()
    setMessages(prev => [...prev, { id: assistantMessageId, sender: 'assistant', text: '', sources: messageSources }])

    try {
      await streamChatWithAI(updatedMessages, relevantEmails, (chunk) => {
        setMessages(prev => {
          const newMessages = [...prev]
          const lastIndex = newMessages.length - 1
          const lastMsg = newMessages[lastIndex]
          if (lastMsg && lastMsg.id === assistantMessageId) {
            newMessages[lastIndex] = { ...lastMsg, text: lastMsg.text + chunk }
          }
          return newMessages
        })
      })

      // Post-streaming Agentic Command Interception
      setMessages(prev => {
        const newMessages = [...prev]
        const lastMsg = newMessages[newMessages.length - 1]
        
        if (lastMsg && lastMsg.text && lastMsg.id === assistantMessageId) {
          const agentMatch = lastMsg.text.match(/<agent>([\s\S]*?)<\/agent>/)
          if (agentMatch) {
            try {
              const command = JSON.parse(agentMatch[1])
              lastMsg.text = lastMsg.text.replace(/<agent>[\s\S]*?<\/agent>/, '').trim()
              if (!lastMsg.text) {
                lastMsg.text = "Executing action..."
              }
              
              if (command.action === 'DRAFT_REPLY') {
                const targetEmail = emails.find(e => e.id === command.emailId)
                setTimeout(() => {
                  toggleCompose({
                    to: targetEmail ? targetEmail.senderEmail : command.to || '',
                    subject: targetEmail ? `Re: ${targetEmail.subject}` : command.subject || '',
                    body: command.content
                  })
                  onClose()
                }, 1000)
              }
            } catch (e) {
              console.error("Failed to parse agentic command:", e)
            }
          }
        }
        return newMessages
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
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="ai-message-sources" style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--color-text-subtle, #666)', fontWeight: 600 }}>Sources:</span>
                        {msg.sources.map(src => (
                          <div 
                            key={src.id} 
                            className="ai-source-pill"
                            onClick={() => {
                              setSelectedEmail(src.email)
                              onClose()
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              background: 'var(--color-bg, #f5efe6)',
                              border: '1px solid var(--color-border, #ccc)',
                              padding: '4px 8px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              color: 'var(--color-text, #333)',
                              cursor: 'pointer',
                              width: 'fit-content',
                              maxWidth: '100%',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              transition: 'all 0.2s'
                            }}
                            onMouseOver={e => e.currentTarget.style.borderColor = 'var(--color-ember, #fc5000)'}
                            onMouseOut={e => e.currentTarget.style.borderColor = 'var(--color-border, #ccc)'}
                          >
                            <span style={{ fontWeight: 600, marginRight: '4px' }}>{src.senderName}:</span>
                            <span style={{ opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis' }}>{src.subject}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <form className="ai-chat-footer" onSubmit={handleSendMessage}>
              <div className="ai-chat-input-pill">
                <input
                  type="text"
                  className="ai-chat-input"
                  placeholder="Ask Zwoop Intelligence..."
                  value={inputMessage}
                  onChange={e => setInputMessage(e.target.value)}
                  disabled={isChatLoading}
                />
                <div 
                  className={`ai-deep-search-badge ${useDeepSearch ? 'active' : ''}`}
                  onClick={() => !isChatLoading && setUseDeepSearch(!useDeepSearch)}
                  title="Search last 30 emails before answering or drafting"
                >
                  <span style={{ fontSize: '14px' }}>⌕</span>
                  Context (Search & Draft)
                </div>
                <button
                  type="submit"
                  className="ai-send-btn"
                  disabled={!inputMessage.trim() || isChatLoading}
                >
                  ➤
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
