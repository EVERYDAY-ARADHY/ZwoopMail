import { useState, useEffect, useRef } from 'react'
import { useMail } from '../../context/MailContext'
import { sendEmail } from '../../api/gmail'
import Avatar from '../shared/Avatar'
import './FloatingChat.css'

export default function FloatingChat() {
  const { selectedEmail, accessToken, user, emails } = useMail()
  const [isExpanded, setIsExpanded] = useState(false)
  const [inputMessage, setInputMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [localReplies, setLocalReplies] = useState({}) // mapped by senderEmail
  const messagesEndRef = useRef(null)

  // When selected email changes, if it's from a person or active stream, expand or refresh chat
  useEffect(() => {
    if (selectedEmail) {
      // Automatically pop up DM box for personal/conversational emails
      setIsExpanded(true)
    } else {
      setIsExpanded(false)
    }
  }, [selectedEmail?.id])

  // Scroll chat to bottom whenever messages update or window expands
  useEffect(() => {
    if (isExpanded && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [isExpanded, selectedEmail?.id, localReplies])

  if (!selectedEmail) return null

  const senderEmail = selectedEmail.senderEmail || 'unknown@domain.com'
  const senderName = selectedEmail.senderName || senderEmail.split('@')[0]
  const currentReplies = localReplies[senderEmail] || []

  // Gather conversational history with this contact from loaded emails
  const contactEmails = (emails || []).filter(
    (e) => e.senderEmail === senderEmail || e.to === senderEmail
  ).sort((a, b) => new Date(a.date) - new Date(b.date))

  if (contactEmails.length === 0 && selectedEmail) {
    contactEmails.push(selectedEmail)
  }

  // Parse out cluttered quotation lines ("On Fri, Jul 24... wrote:") into clean bubbles
  const parseThreadIntoBubbles = () => {
    const bubbles = []

    contactEmails.forEach((e) => {
      const rawText = e.bodyText || e.snippet || ''
      const timestamp = new Date(e.date || Date.now()).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })

      // Try splitting standard Gmail quote blocks
      const replySplitRegex = /(?:On\s+[A-Za-z]{3},\s+[A-Za-z]{3}\s+\d+,\s+\d{4}\s+at\s+.*?\s+wrote:)/i
      const parts = rawText.split(replySplitRegex)

      // The primary newest message in this email
      let latestText = (parts[0] || '').trim()
      latestText = latestText.replace(/[\r\n]+/g, '\n').trim()
      
      let isTruncated = false
      // Truncate excessively long marketing emails or newsletters for the DM view
      if (latestText.length > 250) {
        latestText = latestText.substring(0, 250) + '...'
        isTruncated = true
      }

      if (latestText) {
        bubbles.push({
          id: `${e.id}-primary`,
          sender: 'them',
          senderName,
          senderEmail,
          text: latestText,
          timestamp,
          isTruncated,
          hasAttachment:
            (e.attachments && e.attachments.length > 0) ||
            /\b(pdf|attachment|document|file|credentials)\b/i.test(e.subject || latestText),
          attachmentCount: e.attachments ? e.attachments.length : 1,
        })
      }

      // If there was a quoted reply underneath, render it as an historical exchange bubble
      if (parts.length > 1 && parts[1].trim()) {
        const quotedText = parts[1]
          .replace(/^>\s*/gm, '') // strip leading markdown quotes
          .trim()
          .slice(0, 350) // keep concise

        if (quotedText) {
          // If the quotation references "you" or previous reply, put it before or after appropriately
          bubbles.unshift({
            id: `${e.id}-quote`,
            sender: 'me',
            text: quotedText,
            timestamp: 'Earlier',
          })
        }
      }
    })

    // Append any real-time DMs sent by the user during this session
    currentReplies.forEach((r) => {
      bubbles.push({
        id: r.id,
        sender: 'me',
        text: r.text,
        timestamp: r.timestamp,
      })
    })

    return bubbles
  }

  const threadBubbles = parseThreadIntoBubbles()

  // Handle jump-to-attachment button click inside chat bubble
  const handleJumpToAttachments = (e) => {
    e.stopPropagation()
    const attEl =
      document.getElementById('email-attachments-section') ||
      document.querySelector('.email-view-attachments')

    if (attEl) {
      attEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      attEl.style.boxShadow = '0 0 30px rgba(252, 80, 0, 0.7)'
      attEl.style.border = '2px solid var(--color-ember)'
      setTimeout(() => {
        attEl.style.boxShadow = 'none'
        attEl.style.border = 'none'
      }, 2500)
    } else {
      // Fallback: scroll main viewing panel down smoothly
      const viewPanel = document.querySelector('.email-view-body') || document.querySelector('.email-view')
      if (viewPanel) {
        viewPanel.scrollTo({ top: viewPanel.scrollHeight, behavior: 'smooth' })
      }
    }
  }

  // Handle sending an instant message reply
  const handleSendDM = async (e) => {
    e.preventDefault()
    if (!inputMessage.trim() || isSending) return

    const newReply = {
      id: `local-${Date.now()}`,
      text: inputMessage.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    const updated = {
      ...localReplies,
      [senderEmail]: [...(localReplies[senderEmail] || []), newReply],
    }
    setLocalReplies(updated)
    const textToSend = inputMessage.trim()
    setInputMessage('')

    if (accessToken) {
      setIsSending(true)
      try {
        await sendEmail(accessToken, {
          to: senderEmail,
          subject: selectedEmail.subject?.startsWith('Re:')
            ? selectedEmail.subject
            : `Re: ${selectedEmail.subject || ''}`,
          body: textToSend,
          threadId: selectedEmail.threadId,
        })
      } catch (err) {
        console.error('Failed to send DM via Gmail:', err)
      } finally {
        setIsSending(false)
      }
    }
  }

  // Minimized Trigger Button
  if (!isExpanded) {
    return (
      <div className="floating-chat-container">
        <button
          className="floating-chat-trigger animate-bounce-in"
          onClick={() => setIsExpanded(true)}
          title={`Open direct message conversation with ${senderName}`}
        >
          <span className="floating-chat-trigger-icon">💬</span>
          <span className="floating-chat-trigger-status">
            <span>DM: {senderName}</span>
          </span>
        </button>
      </div>
    )
  }

  // Helper to safely render text with clickable links and clean up file attachments
  const renderTextWithLinks = (text) => {
    if (!text) return null;
    
    // Clean up angle brackets around URLs (common in plain text emails)
    const cleanText = text.replace(/<(https?:\/\/[^>]+)>/g, ' $1 ');

    // Match filename followed by a URL (e.g., "image.jpg https://...")
    const fileUrlRegex = /([a-zA-Z0-9_-]+\.[a-zA-Z0-9]{2,4})\s+(https?:\/\/[^\s]+)/g;
    
    const parts = cleanText.split(fileUrlRegex);
    const elements = [];
    
    for (let i = 0; i < parts.length; i++) {
      if (i % 3 === 0) {
        // Normal text block, check for standalone URLs
        const subParts = parts[i].split(/(https?:\/\/[^\s]+)/g);
        subParts.forEach((subPart, j) => {
          if (subPart.match(/^https?:\/\//)) {
            elements.push(
              <a key={`link-${i}-${j}`} href={subPart} target="_blank" rel="noopener noreferrer">
                {subPart.length > 35 ? subPart.substring(0, 35) + '...' : subPart}
              </a>
            );
          } else if (subPart) {
            elements.push(<span key={`text-${i}-${j}`}>{subPart}</span>);
          }
        });
      } else if (i % 3 === 1) {
        // Filename
        const filename = parts[i];
        const url = parts[i + 1];
        elements.push(
          <a key={`file-${i}`} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--color-border)', padding: '2px 8px', borderRadius: '4px', textDecoration: 'none', fontWeight: 'bold' }}>
            📎 {filename}
          </a>
        );
        i++; // Skip the URL part
      }
    }
    
    return elements;
  };

  // Expanded DM Chat Window
  return (
    <div className="floating-chat-container">
      <div className="floating-chat-window">
        {/* Chat Header */}
        <div className="chat-window-header">
          <div className="chat-header-user">
            <Avatar name={senderName} size="md" />
            <div className="chat-header-info">
              <span className="chat-header-name">
                {senderName}
              </span>
              <span className="chat-header-sub">{senderEmail}</span>
            </div>
          </div>
          <div className="chat-header-actions">
            <button
              className="chat-action-btn"
              onClick={() => setIsExpanded(false)}
              title="Minimize chat window"
            >
              −
            </button>
            <button
              className="chat-action-btn"
              onClick={() => setIsExpanded(false)}
              title="Close chat"
            >
              ×
            </button>
          </div>
        </div>

        {/* Message Thread History */}
        <div className="chat-messages-area">
          <div className="chat-date-separator">
            <span>INSTANT MESSAGING THREAD</span>
          </div>

          {threadBubbles.map((bubble) => (
            <div
              key={bubble.id}
              className={`chat-bubble-row ${bubble.sender === 'me' ? 'outgoing' : 'incoming'}`}
            >
              {bubble.sender === 'them' && (
                <div className="chat-bubble-avatar">
                  <Avatar name={bubble.senderName || senderName} size="sm" />
                </div>
              )}

              <div className="chat-bubble-content">
                <div className="chat-bubble">
                  <div className="chat-bubble-text-content">
                    {renderTextWithLinks(bubble.text)}
                  </div>
                  
                  {/* Truncated Read More Button */}
                  {bubble.isTruncated && (
                    <button
                      className="chat-read-more-icon-btn"
                      onClick={() => setIsExpanded(false)}
                      title="Go to mail"
                    >
                      ➦
                    </button>
                  )}

                  {/* Interactive Attachment / PDF Shortcut Card */}
                  {bubble.sender === 'them' && bubble.hasAttachment && (
                    <div
                      className="chat-attachment-pill"
                      onClick={handleJumpToAttachments}
                      title="Click to highlight and jump to attachments section"
                    >
                      <div className="chat-attachment-icon-text">
                        <span>📎</span>
                        <span>
                          {bubble.attachmentCount && bubble.attachmentCount > 0
                            ? `${bubble.attachmentCount} File${bubble.attachmentCount > 1 ? 's' : ''} / PDF Attached`
                            : 'PDF Document Attached'}
                        </span>
                      </div>
                      <span className="chat-attachment-jump">Jump to file ↗</span>
                    </div>
                  )}
                </div>
                <span className="chat-timestamp">{bubble.timestamp}</span>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Instagram-Style DM Input Footer */}
        <form className="chat-input-footer" onSubmit={handleSendDM}>
          <div className="chat-input-bar-container">
            <button type="button" className="chat-input-emoji" title="Add reaction or emoji">
              ☺
            </button>
            <input
              type="text"
              className="chat-text-input"
              placeholder={`Message ${senderName}...`}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
            />
            <button
              type="submit"
              className="chat-send-btn"
              disabled={!inputMessage.trim() || isSending}
              title="Send instant email reply"
            >
              {isSending ? '⋯' : '➤'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
