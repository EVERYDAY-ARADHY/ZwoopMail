import { useState, useEffect } from 'react'
import { useMail } from '../../context/MailContext'
import { getAttachment } from '../../api/gmail'
import Avatar from '../shared/Avatar'
import Button from '../shared/Button'
import EmptyState from '../shared/EmptyState'
import './EmailView.css'

export default function EmailView() {
  const { selectedEmail, accessToken, user, markAsUnreadEmail } = useMail()
  const [readerMode, setReaderMode] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [processedHtml, setProcessedHtml] = useState('')
  const [loadedAttachments, setLoadedAttachments] = useState([])

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
          <Button variant="ghost" size="sm" icon="↩">Reply</Button>
          <Button variant="ghost" size="sm" icon="↪">Forward</Button>
          <Button variant="ghost" size="sm" icon="▤">Archive</Button>
          <Button variant="ghost" size="sm" icon="☆">Star</Button>
          <Button variant="ghost" size="sm" icon="✉" onClick={() => markAsUnreadEmail(email.id)}>Unread</Button>
        </div>
        <div className="email-view-actions-right">
          <button
            className={`email-view-reader-toggle font-mono ${readerMode ? 'active' : ''}`}
            onClick={() => setReaderMode(!readerMode)}
            title="Toggle reader mode"
          >
            {readerMode ? '◉ reader' : '○ reader'}
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="email-view-header">
        <h1 className="email-view-subject">{email.subject || '(no subject)'}</h1>

        <div className="email-view-meta">
          <Avatar name={email.senderName} size={40} />
          <div className="email-view-meta-info">
            <div className="email-view-sender-row">
              <span className="email-view-sender">{email.senderName}</span>
              <button
                className="email-view-details-btn font-mono"
                onClick={() => setDetailsOpen(!detailsOpen)}
                title="Toggle sender details"
              >
                {detailsOpen ? '▲' : '▼'}
              </button>
            </div>
          </div>
          <div className="email-view-date font-mono">
            {formatFullDate(email.date)}
          </div>
        </div>

        {detailsOpen && (
          <div className="email-view-details-popup font-mono animate-fade-in">
            <div className="detail-row">
              <span className="detail-label">from:</span>
              <span className="detail-value">{email.senderName} &lt;{email.senderEmail}&gt;</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">to:</span>
              <span className="detail-value">{email.to || (user ? user.emailAddress : 'me')}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">date:</span>
              <span className="detail-value">{formatFullDate(email.date)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">subject:</span>
              <span className="detail-value">{email.subject || '(no subject)'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="email-view-body">
        {readerMode ? (
          <div className="email-view-reader">
            {email.bodyText || email.snippet}
          </div>
        ) : (
          processedHtml ? (
            <div
              className="email-view-html"
              dangerouslySetInnerHTML={{ __html: processedHtml }}
            />
          ) : (
            <div className="email-view-reader">
              {email.bodyText || email.snippet}
            </div>
          )
        )}

        {/* Attachments Section */}
        {loadedAttachments && loadedAttachments.length > 0 && (
          <div className="email-view-attachments">
            <div className="attachments-section-title font-mono">
              ─── ATTACHMENTS ({loadedAttachments.length}) ───
            </div>
            <div className="attachments-grid">
              {loadedAttachments.map((att, idx) => {
                const isImage = att.mimeType?.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(att.filename)
                const dataUrl = att.data ? `data:${att.mimeType};base64,${att.data}` : null

                return (
                  <div key={idx} className="attachment-card">
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
                      <span className="attachment-name font-mono" title={att.filename}>
                        {att.filename}
                      </span>
                      {dataUrl ? (
                        <a href={dataUrl} download={att.filename} className="attachment-download-btn font-mono">
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
  )
}

