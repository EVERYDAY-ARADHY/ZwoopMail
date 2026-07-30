/*
 * ZwoopMail AI Engine
 *
 * Provider priority:  Azure Phi-4 → Groq → Gemini Flash
 * AI errors are CONTAINED — they NEVER bubble up to break mail loading.
 * Mail loading (App.jsx) uses heuristic categorization as instant fallback.
 */

// ─── Credentials ──────────────────────────────────────────────────────────────

const AZURE_KEY      = import.meta.env.VITE_AZURE_PHI4_API_KEY || ''
const AZURE_ENDPOINT = import.meta.env.VITE_AZURE_PHI4_ENDPOINT || ''
const AZURE_VERSION  = '2024-12-01-preview'

const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY || ''
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

const GEMINI_KEY          = import.meta.env.VITE_GEMINI_API_KEY || ''
const GEMINI_URL          = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'
const GEMINI_FALLBACK_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent'

// ─── Cache (30-min TTL) ───────────────────────────────────────────────────────

const CACHE_TTL = 30 * 60 * 1000

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(key); return null }
    return data
  } catch { return null }
}

function cacheSet(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })) } catch {}
}

// ─── Message Normalizer ───────────────────────────────────────────────────────
// Converts any input (string | array of {role,content}) into a flat messages array

function toMessages(systemPrompt, userMessage) {
  const msgs = []
  if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt })
  if (Array.isArray(userMessage)) {
    userMessage.forEach(m => {
      if (m && typeof m.content === 'string') msgs.push({ role: m.role || 'user', content: m.content })
    })
  } else if (typeof userMessage === 'string' && userMessage.trim()) {
    msgs.push({ role: 'user', content: userMessage })
  }
  // Ensure at least one user message
  if (!msgs.some(m => m.role === 'user')) msgs.push({ role: 'user', content: 'Hello' })
  return msgs
}

// ─── Retry Helper ─────────────────────────────────────────────────────────────

async function fetchWithRetry(url, options, maxRetries = 2) {
  let delay = 3000
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options)
      if (res.status !== 429 && res.status < 500) return res
      if (attempt === maxRetries) return res
      const after = res.headers.get('Retry-After')
      const wait = after ? parseFloat(after) * 1000 : delay
      console.warn(`[AI] ${res.status} — retrying in ${Math.round(wait / 1000)}s`)
      await new Promise(r => setTimeout(r, wait))
      delay = Math.min(delay * 2, 15000)
    } catch (err) {
      if (attempt === maxRetries) throw err
      await new Promise(r => setTimeout(r, delay))
      delay = Math.min(delay * 2, 15000)
    }
  }
}

// ─── Azure Phi-4 ─────────────────────────────────────────────────────────────

async function callAzure(systemPrompt, userMessage) {
  if (!AZURE_KEY || !AZURE_ENDPOINT) return null

  const messages = toMessages(systemPrompt, userMessage)
  const url = `${AZURE_ENDPOINT}/chat/completions?api-version=${AZURE_VERSION}`

  try {
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': AZURE_KEY },
      body: JSON.stringify({ messages, max_tokens: 1024, temperature: 0.4 }),
    })
    if (!res || !res.ok) {
      const err = await res?.text().catch(() => '')
      console.warn(`[Azure Phi-4] HTTP ${res?.status}:`, err.slice(0, 200))
      return null
    }
    const data = await res.json()
    return data.choices?.[0]?.message?.content || null
  } catch (err) {
    console.warn('[Azure Phi-4] Network error:', err.message)
    return null
  }
}

// ─── Groq ─────────────────────────────────────────────────────────────────────

async function callGroq(systemPrompt, userMessage) {
  if (!GROQ_KEY) return null

  const messages = toMessages(systemPrompt, userMessage)

  try {
    const res = await fetchWithRetry(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, temperature: 0.3, max_tokens: 1024 }),
    })
    if (!res || !res.ok) return null
    const data = await res.json()
    return data.choices?.[0]?.message?.content || null
  } catch (err) {
    console.warn('[Groq] Error:', err.message)
    return null
  }
}

// ─── Gemini ───────────────────────────────────────────────────────────────────

async function callGemini(systemPrompt, userMessage) {
  if (!GEMINI_KEY) return null

  const messages = toMessages(null, userMessage) // Gemini uses system_instruction separately
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))

  const payload = {
    system_instruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
    contents,
    generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
  }

  const tryUrl = async (url) => {
    const res = await fetchWithRetry(`${url}?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return res
  }

  try {
    let res = await tryUrl(GEMINI_URL)
    if (res && !res.ok && [404, 400].includes(res.status)) res = await tryUrl(GEMINI_FALLBACK_URL)
    if (!res || !res.ok) {
      const err = await res?.json().catch(() => ({}))
      throw {
        isApiError: true,
        status: res?.status,
        title: `Gemini API Error (HTTP ${res?.status})`,
        message: err?.error?.message || 'Gemini request failed',
      }
    }
    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw { isApiError: true, status: 200, title: 'Empty Response', message: 'Gemini returned no content.' }
    return text
  } catch (err) {
    if (err.isApiError) throw err
    console.warn('[Gemini] Network error:', err.message)
    return null
  }
}

// ─── Smart Dispatcher: Azure → Groq → Gemini ─────────────────────────────────

async function aiComplete(systemPrompt, userMessage) {
  // 1. Azure Phi-4 (primary)
  const azureResult = await callAzure(systemPrompt, userMessage)
  if (azureResult) return azureResult

  // 2. Groq (secondary)
  const groqResult = await callGroq(systemPrompt, userMessage)
  if (groqResult) return groqResult

  // 3. Gemini (tertiary — throws structured errors for UI display)
  return callGemini(systemPrompt, userMessage)
}

// ─── Exported: AI Chat ────────────────────────────────────────────────────────

/**
 * Main conversational AI chat.
 * Errors thrown here are caught by AIChatModal and shown ONLY inside the chat UI.
 * Mail loading is completely unaffected.
 */
export async function chatWithAI({ messages, emails = [], selectedEmail = null, user = null }) {
  const emailCtx = emails.slice(0, 15).map(e =>
    `[ID:${e.id}] From:${e.senderName} <${e.senderEmail}> | Subject:"${e.subject}" | Date:${e.date ? new Date(e.date).toLocaleDateString() : 'recent'} | Unread:${e.isUnread ? 'Yes' : 'No'} | Snippet:"${(e.snippet || '').slice(0, 120)}"`
  ).join('\n')

  const activeEmail = selectedEmail
    ? `Opened email:\n[ID:${selectedEmail.id}] From:${selectedEmail.senderName} | Subject:${selectedEmail.subject}\nBody: ${(selectedEmail.bodyText || selectedEmail.snippet || '').slice(0, 400)}`
    : 'No email currently opened.'

  const systemPrompt = `You are Zwoop AI, a smart inbox assistant inside ZwoopMail.
User: ${user?.emailAddress || 'User'}

INBOX (up to 15 emails):
${emailCtx || 'No emails loaded.'}

OPENED EMAIL:
${activeEmail}

WEBSITE COMMANDS — include at the END of your response to trigger UI actions:
- Compose:  [[COMMAND: {"action":"compose","to":"email@example.com","subject":"Subject","body":"Body"}]]
- Reply:    [[COMMAND: {"action":"reply","emailId":"REAL_ID","to":"email","subject":"Re: Subject","body":"Body"}]]
- Filter:   [[COMMAND: {"action":"filter","category":"people"}]]
- Select:   [[COMMAND: {"action":"select","emailId":"REAL_ID"}]]
- Archive:  [[COMMAND: {"action":"archive","emailId":"REAL_ID"}]]
- Star:     [[COMMAND: {"action":"star","emailId":"REAL_ID"}]]

Rules: Be concise. Use actual email IDs from the inbox list above. Only include commands when an action is explicitly requested.`

  const result = await aiComplete(systemPrompt, messages)
  if (!result) throw { isApiError: true, status: 503, title: 'All AI providers unavailable', message: 'Azure Phi-4, Groq, and Gemini all failed to respond. Check your API keys in .env.' }
  return result
}

// Backwards-compat alias
export const chatWithGemini = chatWithAI

// ─── Exported: Priority Summary ───────────────────────────────────────────────

export async function generatePrioritySummary(emails = []) {
  if (!emails.length) return []

  const cacheKey = `zwoop_priority_${emails.slice(0, 8).map(e => e.id).join('_')}`
  const cached = cacheGet(cacheKey)
  if (cached) { console.log('[AI] Priority summary from cache'); return cached }

  const sample = emails.slice(0, 8).map(e =>
    `[ID:${e.id}] From:${e.senderName} | Subject:${e.subject} | Snippet:${(e.snippet || '').slice(0, 100)}`
  ).join('\n')

  const systemPrompt = `Identify up to 3 high-priority emails (urgent actions, deadlines, OTPs, direct questions, payments).
Return a JSON array. Keys per item: id, senderName, subject, urgency (High/Medium/Urgent), summary (1 sentence), suggestedAction.
ONLY the raw JSON array, nothing else.`

  try {
    const raw = await aiComplete(systemPrompt, sample)
    if (raw) {
      const match = raw.match(/\[\s*\{[\s\S]*\}\s*\]/)
      if (match) {
        const result = JSON.parse(match[0])
        cacheSet(cacheKey, result)
        return result
      }
    }
  } catch (err) {
    console.warn('[AI] Priority summary failed, using heuristics')
  }

  // Heuristic fallback — always works, no API needed
  return emails.slice(0, 3).map(e => ({
    id: e.id,
    senderName: e.senderName || 'Sender',
    subject: e.subject || 'Email',
    urgency: e.isUnread ? 'High' : 'Medium',
    summary: (e.snippet || 'Review this email.').slice(0, 100) + '...',
    suggestedAction: 'Open email to review details',
  }))
}

// ─── Exported: Email Categorization ──────────────────────────────────────────
// GUARANTEED to return an array the same length as input — NEVER throws.
// App.jsx mail loading depends on this being bulletproof.

export async function categorizeEmails(emails) {
  if (!emails.length) return []

  // Cache check
  const cacheKey = `zwoop_categories_${emails.slice(0, 10).map(e => e.id).join('_')}`
  const cached = cacheGet(cacheKey)
  if (cached && cached.length === emails.length) {
    console.log('[AI] Categories from cache')
    return cached
  }

  // Always produce heuristic result first as guaranteed baseline
  const heuristicResult = emails.map(e => heuristicCategorize(e))

  // Try to enhance first 20 with AI (completely optional, silently falls back)
  const AI_BATCH = 20
  const aiBatch = emails.slice(0, AI_BATCH)

  const summaries = aiBatch.map((e, i) =>
    `${i}. From:${e.senderName} | Subject:${e.subject} | Snippet:${(e.snippet || '').slice(0, 60)}`
  ).join('\n')

  const systemPrompt = `Categorize each email. Output exactly one category per line in order. Valid categories ONLY:
people | transactions | newsletters | notifications | promotions

${aiBatch.length} emails below. Output exactly ${aiBatch.length} lines.`

  try {
    const result = await aiComplete(systemPrompt, summaries)
    if (result) {
      const valid = ['people', 'transactions', 'newsletters', 'notifications', 'promotions']
      const lines = result.trim().split('\n')
      lines.forEach((line, i) => {
        if (i >= aiBatch.length) return
        const cleaned = line.replace(/^\d+[.)]\s*/, '').trim().toLowerCase()
        if (valid.includes(cleaned)) heuristicResult[i] = cleaned
      })
      cacheSet(cacheKey, heuristicResult)
    }
  } catch {
    // AI failed — heuristicResult already set, just log silently
    console.warn('[AI] Categorization AI unavailable, using heuristics for all emails')
  }

  return heuristicResult
}

// ─── Exported: Compose Assist ─────────────────────────────────────────────────

export async function composeAssist(text, action) {
  const instructions = {
    professional: 'Rewrite in a professional, formal business tone. Keep the core message.',
    casual:       'Rewrite in a casual, warm, conversational tone.',
    shorter:      'Make significantly shorter and more concise. Remove fluff.',
    fix_grammar:  'Fix all grammar, spelling, and punctuation. Preserve the original tone.',
    friendly:     'Rewrite in a warm, friendly, genuine tone with appropriate pleasantries.',
    urgent:       'Rewrite to professionally convey urgency and immediate importance.',
  }
  const systemPrompt = `You are an email writing assistant. ${instructions[action] || instructions.professional}
Return ONLY the rewritten email text. No explanations, no quotes, no markdown.`

  const result = await aiComplete(systemPrompt, text)
  if (!result) throw new Error('AI Assist unavailable. Check API keys in .env.')
  return result
}

// ─── Exported: Search Query Parser ───────────────────────────────────────────

export async function parseSearchQuery(naturalQuery) {
  const systemPrompt = `Convert natural language to Gmail search query syntax.
Examples: "emails from John about project" → "from:john subject:project" | "unread last week" → "is:unread newer_than:7d"
Return ONLY the Gmail query string.`
  try {
    const result = await aiComplete(systemPrompt, naturalQuery)
    return result || naturalQuery
  } catch {
    return naturalQuery
  }
}

// ─── Exported: Detect Urgent ─────────────────────────────────────────────────

export async function detectUrgent(emails) {
  if (!emails.length) return []
  const summaries = emails.slice(0, 8).map((e, i) =>
    `${i}. From:${e.senderName} | Subject:${e.subject} | Snippet:${(e.snippet || '').slice(0, 80)}`
  ).join('\n')
  const systemPrompt = `For each email, reply "urgent" or "normal". One word per line.
Urgent = direct question requiring reply, deadline, OTP, action required, payment.`
  try {
    const result = await aiComplete(systemPrompt, summaries)
    if (result) return result.trim().split('\n').map(l => l.trim().toLowerCase() === 'urgent')
  } catch {}
  return emails.slice(0, 8).map(() => false)
}

// ─── Heuristic Categorizer (zero-cost, no API) ───────────────────────────────

function heuristicCategorize(email) {
  const combined = [email.senderEmail, email.subject, email.snippet].join(' ').toLowerCase()
  if (/order|shipping|delivered|receipt|invoice|payment|otp|verification|confirm/i.test(combined)) return 'transactions'
  if (/sale|deal|offer|discount|coupon|promo|unsubscribe|marketing/i.test(combined)) return 'promotions'
  if (/notification|alert|linkedin|facebook|twitter|instagram|github|slack/i.test(combined)) return 'notifications'
  if (/newsletter|digest|weekly|monthly|blog|noreply|no-reply/i.test(combined)) return 'newsletters'
  return 'people'
}
