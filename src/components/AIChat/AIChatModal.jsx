import { useState, useEffect, useRef, useMemo } from 'react'
import { useMail } from '../../context/MailContext'
import { analyzeTodaysEmails, streamChatWithAI, streamDraftReply, retrieveRelevantEmailIds } from '../../api/ai'
import './AIChatModal.css'

export default function AIChatModal({ isOpen, onClose }) {
  const { emails, user, toggleCompose, selectEmail } = useMail()
  const [activeTab, setActiveTab] = useState('summary') // 'summary' | 'chat'

  // Summary State
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [emailAnalysis, setEmailAnalysis] = useState([])
  const [hasAnalyzed, setHasAnalyzed] = useState(false)
  const [analysisError, setAnalysisError] = useState(null)
  const [draftingReplyFor, setDraftingReplyFor] = useState(null) // emailId currently being AI-drafted
  const [contextFor, setContextFor] = useState(null)             // emailId whose context panel is open
  const [contextText, setContextText] = useState('')             // user's preference/context input

  // Chat State
  const [messages, setMessages] = useState([])
  const [inputMessage, setInputMessage] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [useDeepSearch, setUseDeepSearch] = useState(true)
  const chatEndRef = useRef(null)

  // Platform detection — memoised once per mount
  const isMac = useMemo(() => /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform || navigator.userAgent), [])

  // Fetch analysis when opening the summary tab for the first time
  // NOTE: emails.length (not emails ref) avoids re-triggering on every render
  const emailCount = emails.length
  useEffect(() => {
    if (isOpen && activeTab === 'summary' && !hasAnalyzed && emailCount > 0) {
      handleAnalyze()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeTab, hasAnalyzed, emailCount])

  // Scroll to bottom of chat
  useEffect(() => {
    if (activeTab === 'chat' && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, activeTab])

  if (!isOpen) return null

  const handleAnalyze = async () => {
    setIsAnalyzing(true)
    setAnalysisError(null)
    try {
      const results = await analyzeTodaysEmails(emails)
      if (!results || results.length === 0) {
        // Treat empty result as a soft failure so we show a retry option
        setAnalysisError('no_results')
      } else {
        setEmailAnalysis(results)
      }
    } catch (err) {
      console.error('[ZwoopAI] Failed to analyze emails:', err)
      setAnalysisError(err?.message || 'unknown_error')
    } finally {
      // Always mark as "attempted" so the useEffect doesn't loop indefinitely
      setHasAnalyzed(true)
      setIsAnalyzing(false)
    }
  }

  // ── AI Agentic Draft Reply (triggered from Analysis cards) ─────────────────
  const handleAgenticDraftReply = async (email, userContext) => {
    setContextFor(null)
    setContextText('')

    // 1. Switch to chat tab so user sees the action happening
    setActiveTab('chat')

    // 2. Build the human-readable query shown in chat
    const contextSuffix = userContext?.trim() ? ` Preferences: "${userContext.trim()}"` : ''
    const displayQuery = `Draft a reply to "${email.subject}" from ${email.senderName}.${contextSuffix}`

    // 4. Add the user message + a pending assistant message to chat
    const userMsgId = `draft-user-${Date.now()}`
    const assistantMsgId = `draft-ai-${Date.now() + 1}`
    setMessages(prev => [
      ...prev,
      { id: userMsgId, sender: 'user', text: displayQuery },
      { id: assistantMsgId, sender: 'assistant', text: '', isDraftPending: true },
    ])
    setDraftingReplyFor(email.id)

    // 5. Stream the reply body silently using the dedicated draft function
    //    (streamDraftReply has no agent-tag system prompt so the output is clean body text)
    let draftBody = ''
    try {
      await streamDraftReply(email, userContext, (chunk) => { draftBody += chunk })
      draftBody = draftBody.trim()
    } catch (err) {
      console.error('[ZwoopAI] Agentic draft failed:', err)
    } finally {
      setDraftingReplyFor(null)
    }

    // 6. Update assistant bubble to a confirmation message (no raw reply shown)
    setMessages(prev => {
      const next = [...prev]
      const idx = next.findIndex(m => m.id === assistantMsgId)
      if (idx !== -1) {
        next[idx] = {
          ...next[idx],
          text: draftBody
            ? `<div class="ai-compose-transition"><span class="ai-sparkle-burst">✦</span> Reply drafted for "${email.subject}" — opening compose...</div>`
            : '⚠ Drafting failed. Please try again from the Inbox Analysis tab.',
          isDraftPending: false,
          isHtml: !!draftBody // Flag to render as HTML
        }
      }
      return next
    })

    // 7. Brief pause so user sees the confirmation, then open Compose
    if (draftBody) {
      setTimeout(() => {
        onClose()
        toggleCompose({
          to: email.senderEmail || '',
          subject: email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject || ''}`,
          body: draftBody,
        })
      }, 900)
    }
  }

  // ── Client-side draft intent detection ──────────────────────────────────────
  // Phi-mini often fails to output <agent> tags reliably. We detect draft intent
  // locally and route through streamDraftReply (the proven fast method that
  // works perfectly in the Analysis tab) instead.
  const detectDraftIntent = (query) => {
    const q = query.toLowerCase()
    const draftPatterns = [
      /\b(draft|write|compose|create|send|prepare)\b.*\b(reply|response|email|mail|message|decline|acceptance|thank|follow.?up)\b/,
      /\b(reply|respond|decline|accept|thank|follow.?up)\b.*\b(to|for|the|last|recent|latest|this|that)\b.*\b(email|mail|message)?\b/,
      /\b(polite|formal|professional|casual|friendly|urgent)\b.*\b(decline|reply|response|email)\b/,
      /\bdraft\b.*\b(polite|formal|professional|casual)\b/,
      /\b(decline|accept|thank)\b.*\b(last|recent|latest|this)\b/,
    ]
    return draftPatterns.some(p => p.test(q))
  }

  // Find the best target email for a draft request from the search results
  const findTargetEmail = (query, searchedEmails) => {
    const q = query.toLowerCase()
    // If user says "the last email" / "most recent" / "latest", use emails[0]
    if (/\b(last|recent|latest|newest)\b/.test(q)) {
      return emails[0] || searchedEmails[0] || null
    }
    // Otherwise use the first result from deep search (most relevant)
    return searchedEmails[0] || emails[0] || null
  }

  // Extract user tone/preference hints from the draft query
  const extractDraftContext = (query) => {
    const q = query.toLowerCase()
    const tones = []
    if (/\bpolite\b/.test(q)) tones.push('polite')
    if (/\bformal\b|\bprofessional\b/.test(q)) tones.push('formal')
    if (/\bcasual\b|\bfriendly\b/.test(q)) tones.push('casual and friendly')
    if (/\burgent\b/.test(q)) tones.push('urgent')
    if (/\bdecline\b|\breject\b|\bturn down\b/.test(q)) tones.push('politely declining the request/offer')
    if (/\baccept\b|\bagree\b|\bconfirm\b/.test(q)) tones.push('accepting/confirming')
    if (/\bthank\b/.test(q)) tones.push('expressing gratitude')
    if (/\bfollow.?up\b/.test(q)) tones.push('following up on the conversation')
    return tones.length > 0 ? `Tone: ${tones.join(', ')}` : ''
  }

  const handleSendMessage = async (e, text = inputMessage) => {
    if (e) e.preventDefault()
    if (!text.trim() || isChatLoading) return

    const userQuery = text.trim()
    const newMessage = { id: Date.now().toString(), sender: 'user', text: userQuery }
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

        const relevantIds = await retrieveRelevantEmailIds(userQuery, lightWeightEmails)
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

    // ── Always include the most-recent email so "the last email" queries work ──
    const mostRecentEmail = emails[0] // emails are sorted newest-first
    if (mostRecentEmail && !relevantEmails.some(e => e.id === mostRecentEmail.id)) {
      relevantEmails = [mostRecentEmail, ...relevantEmails]
      if (!messageSources.some(s => s.id === mostRecentEmail.id)) {
        messageSources = [
          { id: mostRecentEmail.id, subject: mostRecentEmail.subject, senderName: mostRecentEmail.senderName, email: mostRecentEmail },
          ...messageSources,
        ]
      }
    }

    // ── Check if this is a draft/reply request ────────────────────────────────
    // If so, use streamDraftReply (the proven fast method from Analysis tab)
    // instead of relying on phi-mini to output <agent> tags (which it often fails)
    const isDraftRequest = detectDraftIntent(userQuery)

    if (isDraftRequest) {
      const targetEmail = findTargetEmail(userQuery, relevantEmails)

      if (!targetEmail) {
        // No email found to draft a reply for
        const noEmailMsgId = (Date.now() + 1).toString()
        setMessages(prev => [...prev, {
          id: noEmailMsgId,
          sender: 'assistant',
          text: 'I couldn\'t find a matching email to draft a reply for. Try specifying the sender name or subject.',
          sources: messageSources,
        }])
        setIsChatLoading(false)
        return
      }

      // Show source pill + drafting indicator
      const assistantMsgId = (Date.now() + 1).toString()
      setMessages(prev => [...prev, {
        id: assistantMsgId,
        sender: 'assistant',
        text: '',
        isDraftPending: true,
        sources: [{ id: targetEmail.id, subject: targetEmail.subject, senderName: targetEmail.senderName, email: targetEmail }],
      }])

      // Use the proven streamDraftReply method (same as Analysis tab)
      const draftContext = extractDraftContext(userQuery)
      let draftBody = ''
      try {
        await streamDraftReply(targetEmail, draftContext, (chunk) => { draftBody += chunk })
        draftBody = draftBody.trim()
      } catch (err) {
        console.error('[ZwoopAI] Chat draft via streamDraftReply failed:', err)
      }

      // Update bubble with confirmation
      setMessages(prev => {
        const next = [...prev]
        const idx = next.findIndex(m => m.id === assistantMsgId)
        if (idx !== -1) {
          next[idx] = {
            ...next[idx],
            text: draftBody
              ? `<div class="ai-compose-transition"><span class="ai-sparkle-burst">✦</span> Reply drafted for "${targetEmail.subject}" — opening compose...</div>`
              : '⚠ Drafting failed. Please try again or use the Inbox Analysis tab.',
            isDraftPending: false,
            isHtml: !!draftBody,
          }
        }
        return next
      })

      // Open compose with the draft
      if (draftBody) {
        setTimeout(() => {
          onClose()
          toggleCompose({
            to: targetEmail.senderEmail || '',
            subject: targetEmail.subject?.startsWith('Re:') ? targetEmail.subject : `Re: ${targetEmail.subject || ''}`,
            body: draftBody,
          })
        }, 900)
      }

      setIsChatLoading(false)
      return
    }

    // ── General chat query (non-draft) — use streamChatWithAI ─────────────────
    const assistantMessageId = (Date.now() + 1).toString()
    setMessages(prev => [...prev, { id: assistantMessageId, sender: 'assistant', text: '', sources: messageSources }])

    let fullRawText = ''

    try {
      await streamChatWithAI(updatedMessages, relevantEmails, (chunk) => {
        fullRawText += chunk

        const displayText = fullRawText
          .replace(/<agent>[\s\S]*?<\/agent>/gi, '')
          .replace(/<agent>[\s\S]*$/i, '')
          .trimEnd()

        setMessages(prev => {
          const next = [...prev]
          const lastIndex = next.length - 1
          const lastMsg = next[lastIndex]
          if (lastMsg && lastMsg.id === assistantMessageId) {
            next[lastIndex] = { ...lastMsg, text: displayText }
          }
          return next
        })
      })

      // ── Post-streaming: Agentic Command Interception (fallback) ────────────
      const agentMatch = fullRawText.match(/<agent>([\s\S]*?)<\/agent>/i)

      if (agentMatch) {
        try {
          const command = JSON.parse(agentMatch[1].trim())

          const cleanedDisplay = fullRawText
            .replace(/<agent>[\s\S]*?<\/agent>/gi, '')
            .trim()

          setMessages(prev => {
            const next = [...prev]
            const idx = next.findIndex(m => m.id === assistantMessageId)
            if (idx !== -1) {
              next[idx] = {
                ...next[idx],
                text: cleanedDisplay || 'Done! Opening action…',
              }
            }
            return next
          })

          if (command.action === 'DRAFT_REPLY') {
            const targetEmail = emails.find(e => e.id === command.emailId)
            toggleCompose({
              to: targetEmail ? targetEmail.senderEmail : command.to || '',
              subject: targetEmail
                ? (targetEmail.subject?.startsWith('Re:') ? targetEmail.subject : `Re: ${targetEmail.subject}`)
                : command.subject || '',
              body: command.content || '',
            })
            onClose()
          } else if (command.action === 'VIEW_MAIL') {
            const targetEmail = emails.find(e => e.id === command.emailId)
            if (targetEmail) {
              selectEmail(targetEmail)
              onClose()
            }
          }
        } catch (parseErr) {
          console.error('[ZwoopAI] Failed to parse agentic command:', parseErr, agentMatch[1])
        }
      }

    } catch (err) {
      console.error('[ZwoopAI] Chat streaming failed:', err)
      setMessages(prev => {
        const newMessages = [...prev]
        const lastIndex = newMessages.findIndex(m => m.id === assistantMessageId)
        if (lastIndex !== -1) {
          newMessages[lastIndex] = { ...newMessages[lastIndex], text: '', isError: true }
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
          <div className="ai-modal-title font-display">
            <span className="ai-sparkle-icon">✦</span>
            Zwoop Intelligence
            <span className="ai-model-badge font-mono">phi-mini</span>
          </div>
          <div className="ai-modal-tabs font-mono">
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
                <h3 className="font-display">Recent Inbox Activity</h3>
                <p className="font-mono">AI analysis of all emails received today</p>
              </div>
              <button className="ai-refresh-btn font-mono" onClick={handleAnalyze} disabled={isAnalyzing}>
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

                      {/* Context panel — expands when user clicks AI Draft Reply */}
                      {contextFor === email.id ? (
                        <div className="draft-context-panel">
                          <label className="draft-context-label font-mono">
                            <span style={{ color: 'var(--color-ember)' }}>✦</span> What should the reply say? (optional)
                          </label>
                          <textarea
                            className="draft-context-input"
                            placeholder={'e.g. "Tell them I\'ll follow up next week. Keep it short and friendly."'}
                            value={contextText}
                            onChange={e => setContextText(e.target.value)}
                            rows={3}
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                handleAgenticDraftReply(email, contextText)
                              }
                            }}
                          />
                          <div className="draft-context-actions">
                            <button
                              className="card-btn secondary"
                              onClick={() => { setContextFor(null); setContextText('') }}
                            >Cancel</button>
                            <button
                              className="card-btn primary"
                              onClick={() => handleAgenticDraftReply(email, contextText)}
                              disabled={!!draftingReplyFor}
                              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                              {draftingReplyFor === email.id ? (
                                <><span style={{ display: 'inline-block', animation: 'ai-spin 0.8s linear infinite' }}>✦</span> Drafting...</>
                              ) : '✦ Generate Draft'}
                            </button>
                          </div>
                          <span className="draft-context-hint font-mono">{isMac ? '⌘' : 'Ctrl+'}↵ to generate</span>
                        </div>
                      ) : (
                        <div className="card-footer-btns">
                          <button
                            className="card-btn primary"
                            onClick={() => { setContextFor(email.id); setContextText('') }}
                            disabled={!!draftingReplyFor}
                            style={{ minWidth: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                          >
                            {draftingReplyFor === email.id ? (
                              <><span style={{ display: 'inline-block', animation: 'ai-spin 0.8s linear infinite' }}>✦</span> Drafting...</>
                            ) : '✦ AI Draft Reply'}
                          </button>
                          <button className="card-btn secondary" onClick={() => {
                            onClose()
                            selectEmail(email)
                          }}>View Mail</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : analysisError ? (
              <div className="ai-summary-loading">
                <div style={{ fontSize: '28px', marginBottom: '12px' }}>⚠️</div>
                <p style={{ fontWeight: 600, marginBottom: '6px' }}>
                  {analysisError === 'no_results'
                    ? 'No emails to analyze in the last 7 days.'
                    : 'AI Analysis failed — the model may be busy.'}
                </p>
                <p style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginBottom: '18px', maxWidth: '300px', textAlign: 'center' }}>
                  {analysisError === 'no_results'
                    ? 'Try again later or check back when new mail arrives.'
                    : `Error: ${analysisError}`}
                </p>
                <button
                  className="ai-refresh-btn font-mono"
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  style={{ margin: '0 auto' }}
                >
                  ↻ Retry Analysis
                </button>
              </div>
            ) : (
              <div className="ai-summary-loading">
                <p>No emails found. Make sure your inbox has mail and try refreshing.</p>
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
                    <div className="ai-chat-bubble">
                      {msg.isError ? (
                        <div className="ai-error-badge">
                          <span>⚠</span> AI unavailable — check browser console for details
                        </div>
                      ) : msg.isDraftPending ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
                          <span style={{ display: 'inline-block', animation: 'ai-spin 0.8s linear infinite', color: 'var(--color-ember)' }}>✦</span>
                          Drafting your reply silently…
                        </div>
                      ) : msg.isHtml ? (
                        <div className="ai-markdown-content" dangerouslySetInnerHTML={{ __html: msg.text }} />
                      ) : (
                        <div className="ai-markdown-content" style={{ whiteSpace: 'pre-wrap' }}>
                          {msg.text || (isChatLoading && msg.sender === 'assistant' ? (
                            <div className="loading">
                              <span className="typing-dot"></span>
                              <span className="typing-dot"></span>
                              <span className="typing-dot"></span>
                            </div>
                          ) : '')}
                        </div>
                      )}
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
                              selectEmail(src.email)
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
