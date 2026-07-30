/*
 * AI API Wrapper — Azure Phi-4 (phi-mini)
 * Uses serverless proxy (/api/ai) in production (Vercel) for CORS + key security.
 * Falls back to direct Azure call in local dev if VITE_ keys are present.
 */

// ─── Configuration ──────────────────────────────────────────────────────────
const AZURE_API_KEY = import.meta.env.VITE_AZURE_PHI4_API_KEY || ''
const AZURE_ENDPOINT = import.meta.env.VITE_AZURE_PHI4_ENDPOINT || ''
const AZURE_DIRECT_URL = AZURE_ENDPOINT
  ? `${AZURE_ENDPOINT}/chat/completions?api-version=2024-12-01-preview`
  : ''

const IS_PRODUCTION = import.meta.env.PROD
const PROXY_URL = '/api/ai'

// ─── Core Completion (non-streaming) ─────────────────────────────────────────
async function aiComplete(systemPrompt, userMessage) {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ]

  if (IS_PRODUCTION) {
    return proxyComplete(messages)
  }
  return directAzureComplete(messages)
}

async function directAzureComplete(messages, temperature = 0.3, maxTokens = 1024) {
  if (!AZURE_DIRECT_URL || !AZURE_API_KEY) {
    throw new Error('Azure Phi-4 credentials not configured')
  }

  const res = await fetch(AZURE_DIRECT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': AZURE_API_KEY,
    },
    body: JSON.stringify({
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Phi-4 API error (${res.status}): ${errorText}`)
  }

  const data = await res.json()
  return data.choices[0].message.content
}

async function proxyComplete(messages, temperature = 0.3, maxTokens = 1024) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, temperature, max_tokens: maxTokens }),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Proxy AI error (${res.status}): ${errorText}`)
  }

  const data = await res.json()
  return data.choices[0].message.content
}

// ─── Streaming Chat ──────────────────────────────────────────────────────────
export async function streamChatWithAI(chatMessages, emailContext, onChunk) {
  const systemPrompt = `You are Zwoop Intelligence, an AI assistant integrated into ZwoopMail.
You help users manage, read, summarize, search, and draft emails.
Be concise, friendly, and helpful. Use markdown for formatting when appropriate.

Current user's recent emails (for context):
${(emailContext || []).slice(0, 30).map(e => `• [${e.senderName}] ${e.subject} — ${(e.snippet || '').slice(0, 80)}`).join('\n')}`

  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatMessages.map(m => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: m.text,
    })),
  ]

  if (IS_PRODUCTION) {
    return proxyStream(messages, onChunk)
  }
  return directAzureStream(messages, onChunk)
}

async function directAzureStream(messages, onChunk) {
  const res = await fetch(AZURE_DIRECT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': AZURE_API_KEY,
    },
    body: JSON.stringify({
      messages,
      temperature: 0.5,
      max_tokens: 2000,
      stream: true,
    }),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Phi-4 stream error (${res.status}): ${errorText}`)
  }

  await readSSEStream(res, onChunk)
}

async function proxyStream(messages, onChunk) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      temperature: 0.5,
      max_tokens: 2000,
      stream: true,
    }),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Proxy stream error (${res.status}): ${errorText}`)
  }

  await readSSEStream(res, onChunk)
}

async function readSSEStream(response, onChunk) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    const lines = chunk.split('\n')

    for (const line of lines) {
      if (line.trim() === '' || line.trim() === 'data: [DONE]') continue
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6))
          if (data.choices?.[0]?.delta?.content) {
            onChunk(data.choices[0].delta.content)
          }
        } catch {
          // partial JSON chunk, skip
        }
      }
    }
  }
}

// ─── Email Categorization ────────────────────────────────────────────────────
export async function categorizeEmails(emails) {
  if (!emails.length) return []

  const emailSummaries = emails.map((e, i) => (
    `${i}. From: ${e.senderName} <${e.senderEmail}> | Subject: ${e.subject} | Snippet: ${e.snippet?.slice(0, 100)}`
  )).join('\n')

  const systemPrompt = `You are an email categorizer. For each email, respond with ONLY the category name from this list:
- people (personal emails from real humans, direct conversations)
- transactions (orders, shipping, receipts, OTPs, bank alerts, verifications)
- newsletters (subscriptions, digests, blog updates, periodic content)
- notifications (social media alerts, app notifications, automated updates)
- promotions (marketing, deals, sales, advertising)

Respond with one category per line, matching the email index. Just the category word, nothing else.`

  try {
    const result = await aiComplete(systemPrompt, emailSummaries)
    const categories = result.trim().split('\n').map((line) => {
      const cleaned = line.replace(/^\d+\.\s*/, '').trim().toLowerCase()
      const valid = ['people', 'transactions', 'newsletters', 'notifications', 'promotions']
      return valid.includes(cleaned) ? cleaned : 'notifications'
    })
    return categories
  } catch (err) {
    console.warn('AI categorization failed, using heuristics:', err)
    return emails.map((e) => heuristicCategorize(e))
  }
}

// ─── Urgency Detection ───────────────────────────────────────────────────────
export async function detectUrgent(emails) {
  if (!emails.length) return []

  const emailSummaries = emails.slice(0, 10).map((e, i) => (
    `${i}. From: ${e.senderName} | Subject: ${e.subject} | Snippet: ${e.snippet?.slice(0, 150)}`
  )).join('\n')

  const systemPrompt = `You detect urgent emails that need immediate attention. For each email, respond with "urgent" or "normal".
An email is urgent if it:
- Contains a direct question requiring a response
- Mentions a deadline (today, tomorrow, by end of day, expires)
- Is an OTP or time-sensitive verification code
- Requires an action (confirm, approve, accept, RSVP)
- Is from a real person (not automated) and expects a reply

Respond with one word per line: "urgent" or "normal". Nothing else.`

  try {
    const result = await aiComplete(systemPrompt, emailSummaries)
    const urgencies = result.trim().split('\n').map((line) =>
      line.trim().toLowerCase() === 'urgent'
    )
    return urgencies
  } catch {
    return emails.slice(0, 10).map(() => false)
  }
}

// ─── Compose Assist ──────────────────────────────────────────────────────────
export async function composeAssist(text, action) {
  const actions = {
    professional: 'Rewrite this email in a professional, formal tone. Keep the core message but make it appropriate for business communication.',
    casual: 'Rewrite this email in a casual, friendly tone. Make it warm and conversational while keeping the message clear.',
    shorter: 'Make this email significantly shorter and more concise. Remove unnecessary words and get to the point.',
    fix_grammar: 'Fix any grammar, spelling, or punctuation errors in this email. Keep the original tone and style.',
    friendly: 'Rewrite this email in a warm, friendly tone. Add appropriate pleasantries while keeping it genuine.',
    urgent: 'Rewrite this email to convey urgency. Make it clear that this needs immediate attention, while remaining professional.',
  }

  const systemPrompt = `You are an email writing assistant. ${actions[action] || actions.professional}
Return ONLY the rewritten email text. No explanations, no quotes, no markdown formatting.`

  return aiComplete(systemPrompt, text)
}

// ─── Search Query Parser ─────────────────────────────────────────────────────
export async function parseSearchQuery(naturalQuery) {
  const systemPrompt = `Convert a natural language email search into a Gmail search query.
Examples:
- "emails from John about the project" → "from:john subject:project"
- "unread emails from last week" → "is:unread newer_than:7d"
- "emails with attachments from HyugaLife" → "from:hyugalife has:attachment"
- "important emails from yesterday" → "is:important newer_than:1d"

Return ONLY the Gmail query string. Nothing else.`

  try {
    return await aiComplete(systemPrompt, naturalQuery)
  } catch {
    return naturalQuery
  }
}

// ─── Past 5 Emails Analysis ──────────────────────────────────────────────────
export async function analyzePast5Emails(emails) {
  if (!emails || emails.length === 0) return []

  const recentEmails = emails.slice(0, 5)
  const emailSummaries = recentEmails.map((e) => (
    `ID: ${e.id}\nFrom: ${e.senderName} <${e.senderEmail}>\nSubject: ${e.subject}\nDate: ${e.date}\nSnippet: ${e.snippet?.slice(0, 300)}`
  )).join('\n\n')

  const systemPrompt = `You are an intelligent email analyzer. Analyze each email and return a JSON array.
Each object must have these exact keys:
- id: The email ID provided
- urgency: "high", "medium", or "low"
- summary: A 1-2 sentence concise summary
- actionItem: A short action description (e.g. "Reply required", "Pay invoice", "No action needed")

Respond ONLY with valid JSON. No markdown fences, no explanations.`

  try {
    const response = await aiComplete(systemPrompt, emailSummaries)
    let cleaned = response.trim()
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7)
    if (cleaned.startsWith('```')) cleaned = cleaned.slice(3)
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3)

    return JSON.parse(cleaned.trim())
  } catch (err) {
    console.error('Analysis failed:', err)
    return []
  }
}

// ─── Heuristic Fallback ──────────────────────────────────────────────────────
function heuristicCategorize(email) {
  const from = email.senderEmail?.toLowerCase() || ''
  const subject = email.subject?.toLowerCase() || ''
  const snippet = email.snippet?.toLowerCase() || ''

  if (/order|shipping|delivered|receipt|invoice|payment|otp|verification|confirm/i.test(subject + snippet)) {
    return 'transactions'
  }
  if (/sale|deal|offer|discount|off|coupon|promo|unsubscribe/i.test(subject + snippet)) {
    return 'promotions'
  }
  if (/notification|alert|update|linkedin|facebook|twitter|instagram/i.test(from + subject)) {
    return 'notifications'
  }
  if (/newsletter|digest|weekly|monthly|blog|noreply|no-reply/i.test(from + subject)) {
    return 'newsletters'
  }
  return 'people'
}
