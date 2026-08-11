import { useState, useEffect, useRef } from 'react'
import { useMail } from '../../context/MailContext'
import { getAttachment, getThread } from '../../api/gmail'
import Avatar from '../shared/Avatar'
import Button from '../shared/Button'
import EmptyState from '../shared/EmptyState'
import './EmailView.css'

function ShadowHtmlView({ html }) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (containerRef.current && html) {
      let shadow = containerRef.current.shadowRoot
      if (!shadow) {
        shadow = containerRef.current.attachShadow({ mode: 'open' })
      }
      shadow.innerHTML = `<style>
        :host {
          display: block;
          color: inherit;
          font-family: inherit;
          font-size: 15px;
          line-height: 1.6;
          overflow-x: auto;
        }
        a { color: #fc5000; text-decoration: none; }
        a:hover { text-decoration: underline; }
        img { max-width: 100%; height: auto; border-radius: 4px; }
      </style>` + html
    }
  }, [html])

  return <div ref={containerRef} className="email-view-html" style={{ width: '100%', overflow: 'hidden' }} />
}

function EmailMessageStep({ message, user }) {
  const isMe = user && user.emailAddress && message.from && message.from.toLowerCase().includes(user.emailAddress.toLowerCase())

  // Prefer rendered HTML; fall back to clean plain text
  const hasHtml = Boolean(message.bodyHtml)
  let displayText = ''
  if (!hasHtml) {
    const text = message.bodyText || message.snippet || ''
    const replySplitRegex = /(?:On\s+.*?\s+wrote:|-------- Original Message --------|________________________________)/i
    const parts = text.split(replySplitRegex)
    displayText = (parts[0] || '').trim().replace(/[\r\n]+/g, '\n').trim()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', maxWidth: '85%', flexDirection: isMe ? 'row-reverse' : 'row' }}>
        {!isMe && <Avatar name={message.senderName} size={28} />}
        <div className={`dm-bubble ${isMe ? 'is-me' : ''}`} style={{
          background: isMe ? 'var(--color-ember, #fc5000)' : 'var(--color-surface, #ffffff)',
          color: isMe ? '#ffffff' : 'var(--color-text)',
          padding: '12px 16px',
          borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          boxShadow: isMe ? '0 4px 14px rgba(252, 80, 0, 0.2)' : '0 2px 10px rgba(0,0,0,0.05)',
          border: isMe ? 'none' : '1px solid var(--color-border)',
          fontSize: '0.95em',
          lineHeight: '1.5',
          wordBreak: 'break-word',
          maxWidth: '100%',
          width: hasHtml ? '480px' : undefined,
        }}>
          {hasHtml ? (
            <ShadowHtmlView html={message.bodyHtml} />
          ) : (
            <span style={{ whiteSpace: 'pre-wrap' }}>{displayText}</span>
          )}
        </div>
      </div>
      <div style={{ 
        fontSize: '0.75em', 
        color: 'var(--color-text-tertiary)', 
        marginTop: '4px',
        padding: isMe ? '0 8px 0 0' : '0 0 0 36px'
      }}>
        {new Date(message.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  )
}

export default function EmailView() {
  const { selectedEmail, selectEmail, accessToken, user, markAsUnreadEmail, archiveEmail, toggleStarEmail, toggleCompose } = useMail()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [processedHtml, setProcessedHtml] = useState('')
  const [loadedAttachments, setLoadedAttachments] = useState([])
  const [threadMessages, setThreadMessages] = useState([])

  useEffect(() => {
    if (selectedEmail && selectedEmail.threadId && accessToken) {
      getThread(accessToken, selectedEmail.threadId)
        .then(setThreadMessages)
        .catch(console.error)
    } else {
      setThreadMessages([])
    }
  }, [selectedEmail?.threadId, accessToken])

  useEffect(() => {
    if (!selectedEmail) {
      setProcessedHtml('')
      setLoadedAttachments([])
      return
    }

    let isMounted = true
    const email = selectedEmail
    let html = email.bodyHtml || ''
    const initialAttachments = [...(email.attachments || [])]

    setProcessedHtml(html)
    setLoadedAttachments(initialAttachments)

    async function processAttachmentsAndImages() {
      if (!initialAttachments.length && !html) return

      let htmlChanged = false
      const updatedAttachments = [...initialAttachments]

      for (let i = 0; i < updatedAttachments.length; i++) {
        const att = updatedAttachments[i]

        // Fetch attachment binary from Gmail API if missing and we have accessToken + attachmentId
        if (!att.data && att.id && accessToken) {
          try {
            const base64Data = await getAttachment(accessToken, email.id, att.id)
            att.data = base64Data
          } catch (err) {
            console.error('Failed to load attachment data:', att.filename, err)
          }
        }

        // Replace references in HTML (cid: or filename) with Base64 Data URI
        if (att.data && att.mimeType) {
          const dataUrl = `data:${att.mimeType};base64,${att.data}`
          
          if (att.cid) {
            const escapedCid = att.cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const cidRegex = new RegExp(`src=["']cid:${escapedCid}["']`, 'gi')
            if (cidRegex.test(html)) {
              html = html.replace(cidRegex, `src="${dataUrl}"`)
              htmlChanged = true
            }
          }
          if (att.filename) {
            const escapedName = att.filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const nameRegex = new RegExp(`src=["'](cid:)?${escapedName}["']`, 'gi')
            if (nameRegex.test(html)) {
              html = html.replace(nameRegex, `src="${dataUrl}"`)
              htmlChanged = true
            }
          }
        }
      }

      if (isMounted) {
        if (htmlChanged) setProcessedHtml(html)
        setLoadedAttachments(updatedAttachments)
      }
    }

    processAttachmentsAndImages()

    return () => {
      isMounted = false
    }
  }, [selectedEmail, accessToken])

  if (!selectedEmail) {
    return (
      <div className="email-view email-view-empty">
      </div>
    )
  }

  const email = selectedEmail

  const formatFullDate = (date) => {
    if (!date) return ''
    return new Date(date).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  return (
    <div className="email-view animate-fade-in" key={email.id}>
      {/* Action Bar */}
      <div className="email-view-actions">
        <div className="email-view-actions-left">
          <Button
            variant="ghost"
            size="sm"
            icon="←"
            onClick={() => selectEmail(null)}
            className="mobile-back-btn"
          >Back</Button>
          <Button
            variant="ghost"
            size="sm"
            icon="↩"
            onClick={() => toggleCompose({
              to: email.senderEmail || '',
              subject: email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject || ''}`,
              body: `\n\nOn ${new Date(email.date).toLocaleDateString()}, ${email.senderName} wrote:\n> ${(email.bodyText || email.snippet || '').slice(0, 300)}`
            })}
          >Reply</Button>
          <Button
            variant="ghost"
            size="sm"
            icon="↪"
            onClick={() => toggleCompose({
              to: '',
              subject: email.subject?.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject || ''}`,
              body: `---------- Forwarded message ---------\nFrom: ${email.senderName} <${email.senderEmail}>\nDate: ${new Date(email.date).toLocaleString()}\nSubject: ${email.subject}\n\n${(email.bodyText || email.snippet || '').slice(0, 500)}`
            })}
          >Forward</Button>
          <Button variant="ghost" size="sm" icon="▤" onClick={() => archiveEmail(email.id)}>Archive</Button>
          <Button variant="ghost" size="sm" icon={email.isStarred ? '★' : '☆'} onClick={() => toggleStarEmail(email)}>
            {email.isStarred ? 'Starred' : 'Star'}
          </Button>
          <Button variant="ghost" size="sm" icon="✉" onClick={() => markAsUnreadEmail(email.id)}>Unread</Button>
        </div>
      </div>

      {/* Simplified Subject Header */}
      <div style={{ padding: '0 32px 16px', borderBottom: '1px solid var(--color-border)', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.2em', margin: 0, fontWeight: 'bold' }}>{email.subject || '(no subject)'}</h1>
      </div>

      {/* Body as Chat */}
      <div className="email-view-body" style={{ padding: '0 32px 32px' }}>
        {/* Sleek Chat Stepper for Previous Messages */}
        {(() => {
          const currentIndex = threadMessages.findIndex(m => m.id === email.id)
          const olderMessages = currentIndex > 0 ? threadMessages.slice(0, currentIndex) : []
          if (olderMessages.length > 0) {
            return (
              <div className="email-thread-stepper" style={{ display: 'flex', flexDirection: 'column' }}>
                {olderMessages.map(m => <EmailMessageStep key={m.id} message={m} user={user} />)}
              </div>
            )
          }
          return null
        })()}

        {/* Latest Message as a Chat Bubble */}
        {(() => {
          const isLatestMe = user && user.emailAddress && email.from && email.from.toLowerCase().includes(user.emailAddress.toLowerCase())
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: isLatestMe ? 'flex-end' : 'flex-start', marginTop: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', width: '100%', flexDirection: isLatestMe ? 'row-reverse' : 'row' }}>
                {!isLatestMe && <Avatar name={email.senderName} size={28} />}
                <div className={`dm-bubble ${isLatestMe ? 'is-me' : ''}`} style={{
                  background: isLatestMe ? 'var(--color-ember, #fc5000)' : 'var(--color-surface, #ffffff)',
                  color: isLatestMe ? '#ffffff' : 'var(--color-text)',
                  padding: '16px 20px',
                  borderRadius: isLatestMe ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                  width: '100%',
                  maxWidth: isLatestMe ? '85%' : '90%',
                  boxShadow: isLatestMe ? '0 4px 14px rgba(252, 80, 0, 0.2)' : '0 2px 10px rgba(0,0,0,0.05)',
                  border: isLatestMe ? 'none' : '1px solid var(--color-border)'
                }}>
                  {processedHtml ? (
                    <ShadowHtmlView html={processedHtml} />
                  ) : (
                    <div className="email-view-reader" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit' }}>
                      {email.bodyText || email.snippet}
                    </div>
                  )}

                  {/* Attachments Section inside the bubble */}
                  {loadedAttachments && loadedAttachments.length > 0 && (
                    <div className="email-view-attachments" id="email-attachments-section" style={{ transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)', borderRadius: '8px', marginTop: '16px', borderTop: isLatestMe ? '1px solid rgba(255,255,255,0.2)' : '1px solid var(--color-border)', paddingTop: '16px' }}>
                      <div className="attachments-section-title font-mono" style={{ color: isLatestMe ? 'rgba(255,255,255,0.8)' : 'inherit' }}>
                        ─── ATTACHMENTS ({loadedAttachments.length}) ───
                      </div>
                      <div className="attachments-grid">
                        {loadedAttachments.map((att, idx) => {
                          const isImage = att.mimeType?.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(att.filename)
                          const dataUrl = att.data ? `data:${att.mimeType};base64,${att.data}` : null

                          return (
                            <div key={idx} className="attachment-card" style={{ background: isLatestMe ? 'rgba(0,0,0,0.1)' : 'var(--color-bg)' }}>
                              {isImage && dataUrl ? (
                                <div className="attachment-image-preview">
                                  <img src={dataUrl} alt={att.filename} />
                                </div>
                              ) : (
                                <div className="attachment-file-icon font-mono">
                                  {att.filename ? att.filename.split('.').pop().toUpperCase() : 'FILE'}
                                </div>
                              )}
                              <div className="attachment-footer">
                                <span className="attachment-name font-mono" title={att.filename} style={{ color: isLatestMe ? '#fff' : 'inherit' }}>
                                  {att.filename}
                                </span>
                                {dataUrl ? (
                                  <a href={dataUrl} download={att.filename} className="attachment-download-btn font-mono" style={{ color: isLatestMe ? '#fff' : 'inherit' }}>
                                    [↓ save]
                                  </a>
                                ) : (
                                  <span className="attachment-loading font-mono">loading...</span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ 
                fontSize: '0.75em', 
                color: 'var(--color-text-tertiary)', 
                marginTop: '4px',
                padding: isLatestMe ? '0 8px 0 0' : '0 0 0 36px'
              }}>
                {new Date(email.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

