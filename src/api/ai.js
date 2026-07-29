/*
 * AI API Wrapper for ZwoopMail
 *
 * Priority order:
 *  1. Azure Phi-4    (primary  — enterprise, no free-tier caps)
 *  2. Groq Llama     (fallback — if VITE_GROQ_API_KEY is set)
 *  3. Gemini Flash   (fallback — free tier, rate-limited)
 *
 * Features:
 *  - 429 / 5xx retry with exponential back-off
 *  - localStorage caching (30-min TTL) for categories & priority summary
 *  - Heuristic categorizer as zero-cost final fallback
 */

// ─── Credentials ──────────────────────────────────────────────────────────────

const AZURE_PHI4_KEY      = import.meta.env.VITE_AZURE_PHI4_API_KEY || ''
const AZURE_PHI4_ENDPOINT = import.meta.env.VITE_AZURE_PHI4_ENDPOINT || ''
const AZURE_API_VERSION   = '2024-12-01-preview'

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || ''
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

const GEMINI_API_KEY      = import.meta.env.VITE_GEMINI_API_KEY || ''
const GEMINI_PRIMARY_URL  = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'
const GEMINI_FALLBACK_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent'

// Cache TTL: 30 minutes
const CACHE_TTL = 30 * 60 * 1000

// ─── Cache Helpers ────────────────────────────────────────────────────────────

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

// ─── Retry Helper ─────────────────────────────────────────────────────────────

async function fetchWithRetry(url, options, maxRetries = 3) {
  let delay = 3000
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options)
    if (res.status !== 429 && res.status < 500) return res
    if (attempt === maxRetries) return res
    const retryAfter = res.headers.get('Retry-After')
    const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : delay
    console.warn(`[AI] ${res.status} — retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/${maxRetries})`)
    await new Promise(r => setTimeout(r, waitMs))
    delay = Math.min(delay * 2, 20000)
  }
}

// ─── Azure Phi-4 Call ─────────────────────────────────────────────────────────

async function callAzurePhi4(systemPrompt, messages) {
  if (!AZURE_PHI4_KEY || !AZURE_PHI4_ENDPOINT) return null

  const url = `${AZURE_PHI4_ENDPOINT}/chat/completions?api-version=${AZURE_API_VERSION}`

  let formattedMessages = []
  if (systemPrompt) formattedMessages.push({ role: 'system', content: systemPrompt })

  if (Array.isArray(messages)) {
    messages.forEach(m => formattedMessages.push({ role: m.role === 'assistant' ? 'assistant' : m.role, content: m.content }))
  } else {
    formattedMessages.push({ role: 'user', content: String(messages) })
  }

  let response
  try {
    response = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': AZURE_PHI4_KEY },
      body: JSON.stringify({ messages: formattedMessages, max_tokens: 1024, temperature: 0.4 }),
    })
  } catch (netErr) {
    console.warn('[Azure Phi-4] Network error:', netErr.message)
    return null
  }

  if (!response || !response.ok) {
    const status = response?.status
    let errText = ''
    try { errText = await response.text() } catch {}
    console.warn(`[Azure Phi-4] HTTP ${status}:`, errText)
    return null
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || null
}

// ─── Gemini Call ─────────────────────────────────────────────────────────────

async function callGeminiAPI(systemPrompt, userMessages, generationConfig = {}) {
  if (!GEMINI_API_KEY) return null

  let contents = []
  if (Array.isArray(userMessages)) {
    contents = userMessages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))
  } else {
    contents = [{ role: 'user', parts: [{ text: String(userMessages) }] }]
  }

  const payload = {
    system_instruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
    contents,
    generationConfig: { temperature: 0.4, maxOutputTokens: 1024, ...generationConfig },
  }

  const tryModel = async (url) => {
    const res = await fetchWithRetry(`${url}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return res
  }

  let response
  try {
    response = await tryModel(GEMINI_PRIMARY_URL)
    if (response && !response.ok && [404, 400].includes(response.status)) {
      response = await tryModel(GEMINI_FALLBACK_URL)
    }
  } catch (netErr) {
    throw { isApiError: true, status: 0, title: 'Network Error', message: netErr.message }
  }

  if (!response || !response.ok) {
    let errorDetail = ''
    try { const e = await response.json(); errorDetail = e?.error?.message || '' } catch {}
    throw {
      isApiError: true,
      status: response?.status,
      title: `Gemini API Error (HTTP ${response?.status})`,
      message: errorDetail || 'Gemini request failed',
    }
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw { isApiError: true, status: 200, title: 'Empty Response', message: 'Gemini returned no content.' }
  return text
}

// ─── Groq Call ────────────────────────────────────────────────────────────────

async function callGroq(systemPrompt, userMessage) {
  if (!GROQ_API_KEY) return null
  const msgs = []
  if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt })
  if (Array.isArray(userMessage)) msgs.push(...userMessage)
  else msgs.push({ role: 'user', content: String(userMessage) })

  const res = await fetchWithRetry(GROQ_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: msgs, temperature: 0.3, max_tokens: 1024 }),
  })
  if (!res || !res.ok) return null
  const data = await res.json()
  return data.choices?.[0]?.message?.content || null
}

// ─── Smart Dispatcher — Azure → Groq → Gemini ─────────────────────────────────

async function aiComplete(systemPrompt, userMessage) {
  // 1. Try Azure Phi-4 (primary)
  if (AZURE_PHI4_KEY && AZURE_PHI4_ENDPOINT) {
    const azureResult = await callAzurePhi4(systemPrompt, userMessage)
    if (azureResult) return azureResult
    console.warn('[AI] Azure Phi-4 failed, trying next provider...')
  }

  // 2. Try Groq
  if (GROQ_API_KEY) {
    const groqResult = await callGroq(systemPrompt, userMessage)
    if (groqResult) return groqResult
    console.warn('[AI] Groq failed, trying Gemini...')
  }

  // 3. Try Gemini
  return callGeminiAPI(systemPrompt, userMessage)
}

// ─── Exported Features ────────────────────────────────────────────────────────

/**
 * Conversational AI chat with inbox context + website command execution.
 */
export async function chatWithGemini({ messages, emails = [], selectedEmail = null, user = null }) {
  const emailCtx = emails.slice(0, 10).map(e =>
    `[ID:${e.id}] From:${e.senderName} | Subject:"${e.subject}" | Unread:${e.isUnread ? 'Yes' : 'No'} | Snippet:"${(e.snippet || '').slice(0, 100)}"`
  ).join('\n')

  const activeEmail = selectedEmail
    ? `Active: From:${selectedEmail.senderName} | Subject:${selectedEmail.subject}\nBody:${(selectedEmail.bodyText || selectedEmail.snippet || '').slice(0, 300)}`
    : 'No email currently opened.'

  const systemPrompt = `You are Zwoop AI, a smart inbox assistant inside ZwoopMail.
User: ${user?.emailAddress || 'User'}

INBOX (top 10):
${emailCtx || 'No emails loaded.'}

OPENED EMAIL:
${activeEmail}

WEBSITE COMMANDS — append to trigger real UI actions:
- Compose:  [[COMMAND: {"action":"compose","to":"email","subject":"Subject","body":"Body"}]]
- Reply:    [[COMMAND: {"action":"reply","emailId":"ID","to":"email","subject":"Re: Sub","body":"Body"}]]
- Filter:   [[COMMAND: {"action":"filter","query":"term","category":"people|transactions|newsletters|notifications|promotions"}]]
- Select:   [[COMMAND: {"action":"select","emailId":"ID"}]]
- Archive:  [[COMMAND: {"action":"archive","emailId":"ID"}]]
- Star:     [[COMMAND: {"action":"star","emailId":"ID"}]]

Be concise. Use commands only when an action is requested.`

  return aiComplete(systemPrompt, messages)
}

/**
 * Priority summary — cached 30 min to avoid repeated API calls.
 */
export async function generatePrioritySummary(emails = []) {
  if (!emails.length) return []

  const cacheKey = `zwoop_priority_${emails.slice(0, 8).map(e => e.id).join('_')}`
  const cached = cacheGet(cacheKey)
  if (cached) { console.log('[AI] Priority summary from cache'); return cached }

  const sample = emails.slice(0, 8).map(e =>
    `[ID:${e.id}] From:${e.senderName} | Subject:${e.subject} | Snippet:${(e.snippet || '').slice(0, 100)}`
  ).join('\n')

  const systemPrompt = `Identify up to 3 high-priority emails (urgent actions, deadlines, OTPs, direct questions, payments).
Return a JSON array inside a json code block. Keys per item: id, senderName, subject, urgency (High/Medium/Urgent), summary (1 sentence), suggestedAction.
ONLY the JSON array, no other text.`

  try {
    const raw = await aiComplete(systemPrompt, sample)
    const match = raw.match(/\[\s*\{[\s\S]*\}\s*\]/)
    if (match) {
      const result = JSON.parse(match[0])
      cacheSet(cacheKey, result)
      return result
    }
  } catch (err) {
    console.warn('[AI] Priority summary failed, using heuristics:', err?.title || err?.message || err)
  }

  return emails.slice(0, 3).map(e => ({
    id: e.id,
    senderName: e.senderName || 'Sender',
    subject: e.subject || 'Email',
    urgency: e.isUnread ? 'High' : 'Medium',
    summary: (e.snippet || 'Review this email.').slice(0, 100) + '...',
    suggestedAction: 'Open email to review details',
  }))
}

/**
 * Categorize emails — cached per session, heuristics for overflow.
 */
export async function categorizeEmails(emails) {
  if (!emails.length) return []

  const cacheKey = `zwoop_categories_${emails.slice(0, 10).map(e => e.id).join('_')}`
  const cached = cacheGet(cacheKey)
  if (cached && cached.length === emails.length) {
    console.log('[AI] Categories from cache')
    return cached
  }

  const AI_BATCH = 20
  const aiBatch = emails.slice(0, AI_BATCH)
  const heuristicBatch = emails.slice(AI_BATCH)

  const summaries = aiBatch.map((e, i) =>
    `${i}. From:${e.senderName} <${e.senderEmail}> | Subject:${e.subject} | Snippet:${e.snippet?.slice(0, 80)}`
  ).join('\n')

  const systemPrompt = `For each email below, output ONLY one category name per line (matching the index order):
people | transactions | newsletters | notifications | promotions

One word per line. No numbers, no punctuation. Nothing else.`

  let aiCategories = []
  try {
    const result = await aiComplete(systemPrompt, summaries)
    const valid = ['people', 'transactions', 'newsletters', 'notifications', 'promotions']
    aiCategories = result.trim().split('\n').map((line, i) => {
      const cleaned = line.replace(/^\d+[.)]\s*/, '').trim().toLowerCase()
      return valid.includes(cleaned) ? cleaned : heuristicCategorize(aiBatch[i] || {})
    })
  } catch (err) {
    console.warn('[AI] Categorization failed, full heuristics:', err?.title || err?.message || err)
    aiCategories = aiBatch.map(e => heuristicCategorize(e))
  }

  while (aiCategories.length < aiBatch.length) {
    aiCategories.push(heuristicCategorize(aiBatch[aiCategories.length]))
  }

  const allCategories = [...aiCategories, ...heuristicBatch.map(e => heuristicCategorize(e))]
  cacheSet(cacheKey, allCategories)
  return allCategories
}

/**
 * Detect urgent emails needing immediate attention.
 */
export async function detectUrgent(emails) {
  if (!emails.length) return []
  const summaries = emails.slice(0, 8).map((e, i) =>
    `${i}. From:${e.senderName} | Subject:${e.subject} | Snippet:${e.snippet?.slice(0, 100)}`
  ).join('\n')

  const systemPrompt = `For each email, reply "urgent" or "normal". One word per line.
Urgent = direct question needing reply, deadline today/tomorrow, OTP/verification, action required, payment due.`

  try {
    const result = await aiComplete(systemPrompt, summaries)
    return result.trim().split('\n').map(line => line.trim().toLowerCase() === 'urgent')
  } catch {
    return emails.slice(0, 8).map(() => false)
  }
}

/**
 * AI-powered compose tone/style assist.
 */
export async function composeAssist(text, action) {
  const instructions = {
    professional: 'Rewrite in a professional, formal business tone. Keep the core message.',
    casual:       'Rewrite in a casual, warm, conversational tone.',
    shorter:      'Make significantly shorter and more concise. Remove fluff.',
    fix_grammar:  'Fix all grammar, spelling, and punctuation. Preserve the original tone.',
    friendly:     'Rewrite in a warm, friendly, genuine tone.',
    urgent:       'Rewrite to professionally convey urgency and immediate importance.',
  }

  const systemPrompt = `You are an email writing assistant. ${instructions[action] || instructions.professional}
Return ONLY the rewritten email text. No explanations, no quotes, no markdown formatting.`

  return aiComplete(systemPrompt, text)
}

/**
 * Convert natural language search into Gmail query syntax.
 */
export async function parseSearchQuery(naturalQuery) {
  const systemPrompt = `Convert natural language to a Gmail search query.
Examples: "emails from John about project" → "from:john subject:project" | "unread from last week" → "is:unread newer_than:7d"
Return ONLY the Gmail query string. Nothing else.`

  try { return await aiComplete(systemPrompt, naturalQuery) }
  catch { return naturalQuery }
}

// ─── Heuristic Categorizer ────────────────────────────────────────────────────

function heuristicCategorize(email) {
  const combined = [email.senderEmail, email.subject, email.snippet].join(' ').toLowerCase()
  if (/order|shipping|delivered|receipt|invoice|payment|otp|verification|confirm/i.test(combined)) return 'transactions'
  if (/sale|deal|offer|discount|coupon|promo|unsubscribe|marketing/i.test(combined)) return 'promotions'
  if (/notification|alert|linkedin|facebook|twitter|instagram|github|slack/i.test(combined)) return 'notifications'
  if (/newsletter|digest|weekly|monthly|blog|noreply|no-reply/i.test(combined)) return 'newsletters'
  return 'people'
}
