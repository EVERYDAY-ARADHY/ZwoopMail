/*
 * Gmail API Wrapper
 * Handles OAuth2 authentication and Gmail REST API calls.
 * The Gmail API is free to use under Google Cloud's quota system.
 */

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify'

// NOTE: Replace with your own Client ID from Google Cloud Console
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

/**
 * Initialize Google OAuth2 and sign in.
 * Uses the Google Identity Services (GIS) library.
 */
export async function signInWithGoogle() {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services not loaded. Check your internet connection.'))
      return
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error))
          return
        }
        resolve(response.access_token)
      },
    })

    tokenClient.requestAccessToken()
  })
}

/**
 * Fetch user profile info
 */
export async function getUserProfile(accessToken) {
  const res = await fetch(`${GMAIL_API_BASE}/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to fetch profile')
  return res.json()
}

/**
 * List messages from inbox
 * @param {string} accessToken
 * @param {number} maxResults - max emails to fetch (default 30)
 * @param {string} query - Gmail search query
 */
export async function listMessages(accessToken, maxResults = 30, query = 'in:inbox') {
  const params = new URLSearchParams({
    maxResults: maxResults.toString(),
    q: query,
  })

  const res = await fetch(`${GMAIL_API_BASE}/messages?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to list messages')
  const data = await res.json()
  return data.messages || []
}

/**
 * Get full message content by ID
 */
export async function getMessage(accessToken, messageId) {
  const res = await fetch(`${GMAIL_API_BASE}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Failed to fetch message ${messageId}`)
  const raw = await res.json()
  return parseGmailMessage(raw)
}

/**
 * Get multiple messages in parallel (in chunks of 25 to avoid API limits)
 */
export async function getMessages(accessToken, messageIds) {
  const results = []
  const batchSize = 20
  for (let i = 0; i < messageIds.length; i += batchSize) {
    const batch = messageIds.slice(i, i + batchSize)
    const promises = batch.map((msg) =>
      getMessage(accessToken, msg.id).catch((err) => {
        console.warn(`Failed to fetch message ${msg.id}:`, err)
        return null
      })
    )
    const batchResults = await Promise.all(promises)
    results.push(...batchResults.filter(Boolean))
  }
  return results
}

/**
 * Fetch a full thread by threadId
 */
export async function getThread(accessToken, threadId) {
  const res = await fetch(`${GMAIL_API_BASE}/threads/${threadId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Failed to fetch thread ${threadId}`)
  const data = await res.json()
  return data.messages ? data.messages.map(parseGmailMessage) : []
}

/**
 * Fetch attachment or inline image binary data by message ID and attachment ID
 */
export async function getAttachment(accessToken, messageId, attachmentId) {
  const res = await fetch(`${GMAIL_API_BASE}/messages/${messageId}/attachments/${attachmentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Failed to fetch attachment ${attachmentId}`)
  const data = await res.json()
  return data.data ? data.data.replace(/-/g, '+').replace(/_/g, '/') : ''
}

/**
 * Send an email
 */
export async function sendEmail(accessToken, { to, subject, body, cc, bcc, threadId }) {
  const emailLines = [
    `To: ${to}`,
    cc ? `Cc: ${cc}` : '',
    bcc ? `Bcc: ${bcc}` : '',
    `Subject: ${subject}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    body,
  ].filter(Boolean)

  const email = emailLines.join('\r\n')
  const encodedEmail = btoa(unescape(encodeURIComponent(email)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const payload = { raw: encodedEmail }
  if (threadId) {
    payload.threadId = threadId
  }

  const res = await fetch(`${GMAIL_API_BASE}/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) throw new Error('Failed to send email')
  return res.json()
}

/**
 * Modify message labels (archive, star, mark read)
 */
export async function modifyMessage(accessToken, messageId, addLabels = [], removeLabels = []) {
  const res = await fetch(`${GMAIL_API_BASE}/messages/${messageId}/modify`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      addLabelIds: addLabels,
      removeLabelIds: removeLabels,
    }),
  })
  if (!res.ok) throw new Error('Failed to modify message')
  return res.json()
}

/* Convenience functions */
export const archiveMessage = (token, id) =>
  modifyMessage(token, id, [], ['INBOX'])

export const starMessage = (token, id) =>
  modifyMessage(token, id, ['STARRED'], [])

export const markAsRead = (token, id) =>
  modifyMessage(token, id, [], ['UNREAD'])

export const markAsUnread = (token, id) =>
  modifyMessage(token, id, ['UNREAD'], [])

/**
 * Parse raw Gmail API message into a clean object
 */
export function parseGmailMessage(raw) {
  const headers = raw.payload?.headers || []
  const getHeader = (name) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

  const from = getHeader('From')
  const to = getHeader('To')
  const subject = getHeader('Subject')
  const date = getHeader('Date')

  // Extract sender name and email
  const senderMatch = from.match(/^(.+?)\s*<(.+?)>$/)
  let senderName = senderMatch ? senderMatch[1].replace(/"/g, '').trim() : from.trim()
  const senderEmail = senderMatch ? senderMatch[2].trim() : from.trim()

  if (senderName.includes('@')) {
    const username = senderName.split('@')[0]
    senderName = username.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  // Extract body and attachments
  let bodyHtml = ''
  let bodyText = ''
  const attachments = []
  const inlineCids = {}

  function extractBody(part) {
    if (part.mimeType === 'text/html' && part.body?.data) {
      bodyHtml = decodeBase64Url(part.body.data)
    }
    if (part.mimeType === 'text/plain' && part.body?.data) {
      bodyText = decodeBase64Url(part.body.data)
    }
    
    // Detect attachments and inline images
    if (part.body && (part.body.attachmentId || (part.filename && part.body.data))) {
      const cidHeader = part.headers?.find((h) => h.name.toLowerCase() === 'content-id')?.value
      const cid = cidHeader ? cidHeader.replace(/^<|>$/g, '').trim() : null
      const base64Data = part.body.data ? part.body.data.replace(/-/g, '+').replace(/_/g, '/') : null
      
      const attachmentInfo = {
        id: part.body.attachmentId,
        filename: part.filename || (cid ? `inline-${cid}` : 'attachment'),
        mimeType: part.mimeType || 'application/octet-stream',
        size: part.body.size,
        cid: cid,
        data: base64Data
      }

      attachments.push(attachmentInfo)
      if (cid) {
        inlineCids[cid] = attachmentInfo
      }
    }

    if (part.parts) {
      part.parts.forEach(extractBody)
    }
  }

  if (raw.payload) {
    extractBody(raw.payload)
  }

  // Get snippet as fallback
  const snippet = raw.snippet || ''
  const isUnread = raw.labelIds?.includes('UNREAD') || false
  const isStarred = raw.labelIds?.includes('STARRED') || false
  const labels = raw.labelIds || []

  return {
    id: raw.id,
    threadId: raw.threadId,
    from,
    senderName,
    senderEmail,
    to,
    subject,
    date: new Date(date),
    snippet,
    bodyHtml,
    bodyText: bodyText || stripHtml(bodyHtml),
    attachments,
    inlineCids,
    isUnread,
    isStarred,
    labels,
    category: null, // Will be set by AI categorization
  }
}

function decodeBase64Url(data) {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
  } catch {
    return atob(base64)
  }
}

function stripHtml(html) {
  // Remove MSO/VML conditional comments and their contents before parsing
  let cleaned = html
    .replace(/<!--\[if[\s\S]*?\]-->[\s\S]*?<!--\[endif\]-->/gi, '')
    .replace(/<!--\[if[\s\S]*?\]>/gi, '')
    .replace(/<\!\[endif\]-->/gi, '')
    // Remove style and script blocks entirely
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
  const doc = new DOMParser().parseFromString(cleaned, 'text/html')
  return doc.body?.textContent?.replace(/\s+/g, ' ').trim() || ''
}
