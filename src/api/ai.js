/*
 * AI API Wrapper for ZwoopMail
 * Powered by Gemini AI (gemini-1.5-flash primary — free-tier stable)
 *
 * Key improvements over v1:
 *  - Switched primary model to gemini-1.5-flash (higher free-tier RPM)
 *  - 429 retry with exponential back-off (respects Retry-After header)
 *  - localStorage caching for categorization & priority summary
 *  - Reduced batch size to stay within free-tier token budget
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || ''

// gemini-1.5-flash is the free-tier sweet spot: 15 RPM, 1M TPM, 1500 RPD
const GEMINI_PRIMARY_URL   = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'
const GEMINI_FALLBACK_URL  = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent'
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || ''

const useGroq = !!GROQ_API_KEY

// Cache TTL: 30 minutes (milliseconds)
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

// ─── 429 Retry Helper ─────────────────────────────────────────────────────────

async function fetchWithRetry(url, options, maxRetries = 3) {
  let delay = 5000 // start with 5s

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options)

    if (res.status !== 429) return res

    if (attempt === maxRetries) return res

    // Respect Retry-After header if present, otherwise exponential back-off
    const retryAfter = res.headers.get('Retry-After')
    const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : delay

    console.warn(`[Gemini] 429 rate-limited. Retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/${maxRetries})`)
    await new Promise(r => setTimeout(r, waitMs))
    delay = Math.min(delay * 2, 30000) // cap at 30s
  }
}

// ─── Core Gemini Call ─────────────────────────────────────────────────────────

async function callGeminiAPI(systemPrompt, userMessages, generationConfig = {}) {
  if (!GEMINI_API_KEY) {
    throw {
      isApiError: true,
      status: 401,
      title: 'Missing Gemini API Key',
      message:
        'VITE_GEMINI_API_KEY is not set. Get a free key at aistudio.google.com/apikey — it must start with "AIzaSy".',
    }
  }

  // Warn if key format looks wrong (should start with AIzaSy)
  if (!GEMINI_API_KEY.startsWith('AIza')) {
    console.warn(
      '[Gemini] ⚠️ API key may be invalid. Gemini API keys from AI Studio start with "AIzaSy...". ' +
      'An "AQ." prefix indicates a GCP OAuth token — wrong credential type.'
    )
  }

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
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 1024,   // Reduced from 2048 to save free-tier tokens
      ...generationConfig,
    },
  }

  const makeReq = (url) => fetchWithRetry(
    `${url}?key=${GEMINI_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
  )

  let response
  let endpointUsed = GEMINI_PRIMARY_URL

  try {
    response = await makeReq(GEMINI_PRIMARY_URL)

    // Auto-fallback to 8b model on 404/400 (model not available in region)
    if (response && !response.ok && (response.status === 404 || response.status === 400)) {
      endpointUsed = GEMINI_FALLBACK_URL
      response = await makeReq(GEMINI_FALLBACK_URL)
    }
  } catch (netErr) {
    throw {
      isApiError: true,
      status: 0,
      title: 'Network / Connection Error',
      message: `Failed to reach Gemini API: ${netErr.message}`,
    }
  }

  if (!response.ok) {
    let errorDetail = ''
    let retryHint = ''
    try {
      const errJson = await response.json()
      errorDetail = errJson?.error?.message || JSON.stringify(errJson)
      // Surface the retry hint from the message
      const retryMatch = errorDetail.match(/retry in ([\d.]+)s/i)
      if (retryMatch) retryHint = ` (API suggests retrying in ${parseFloat(retryMatch[1]).toFixed(1)}s)`
    } catch {
      errorDetail = await response.text()
    }

    if (response.status === 429) {
      throw {
        isApiError: true,
        status: 429,
        title: 'Gemini Rate Limit Exceeded (HTTP 429)',
        message:
          `You've hit the free-tier rate limit.${retryHint}\n\n` +
          `Fix: Go to aistudio.google.com/apikey and verify your key starts with "AIzaSy". ` +
          `Free-tier limits: 15 requests/min, 1500 requests/day for gemini-1.5-flash. ` +
          `If you need higher limits, enable billing at console.cloud.google.com.`,
      }
    }

    throw {
      isApiError: true,
      status: response.status,
      statusText: response.statusText,
      title: `Gemini API Error (HTTP ${response.status})`,
      message: errorDetail || `Request failed on ${endpointUsed}`,
    }
  }

  const data = await response.json()
  const candidate = data.candidates?.[0]

  if (!candidate || !candidate.content?.parts?.[0]?.text) {
    throw {
      isApiError: true,
      status: 200,
      title: 'Empty Response',
      message: 'Gemini returned no content (safety filter may have triggered).',
    }
  }

  return candidate.content.parts[0].text
}

// ─── Generic completion (Groq or Gemini) ─────────────────────────────────────

async function aiComplete(systemPrompt, userMessage) {
  if (useGroq) return groqComplete(systemPrompt, userMessage)
  return callGeminiAPI(systemPrompt, userMessage)
}

async function groqComplete(systemPrompt, userMessage) {
  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    }),
  })
  if (!res.ok) throw new Error('Groq API call failed')
  const data = await res.json()
  return data.choices[0].message.content
}

// ─── Exported AI Features ─────────────────────────────────────────────────────

/**
 * Interactive conversational Gemini chat with website control commands.
 */
export async function chatWithGemini({ messages, emails = [], selectedEmail = null, user = null }) {
  // Limit context to 10 emails to stay within token budget
  const emailContextSnippet = emails.slice(0, 10).map((e) =>
    `[ID: ${e.id}] From: ${e.senderName} | Subject: "${e.subject}" | Unread: ${e.isUnread ? 'Yes' : 'No'} | Snippet: "${(e.snippet || '').slice(0, 100)}"`
  ).join('\n')

  const selectedContext = selectedEmail
    ? `Active email — From: ${selectedEmail.senderName} | Subject: ${selectedEmail.subject}\nBody: ${(selectedEmail.bodyText || selectedEmail.snippet || '').slice(0, 300)}`
    : 'No email currently opened.'

  const systemPrompt = `You are Zwoop AI, a smart inbox assistant built into ZwoopMail.
User: ${user?.emailAddress || 'User'}

INBOX (top 10 emails):
${emailContextSnippet || 'No emails loaded.'}

CURRENT EMAIL:
${selectedContext}

WEBSITE COMMANDS — append to your response to trigger UI actions:
- Compose: [[COMMAND: {"action":"compose","to":"email@example.com","subject":"Subject","body":"Body text"}]]
- Reply:   [[COMMAND: {"action":"reply","emailId":"ID","to":"email","subject":"Re: Sub","body":"Body"}]]
- Filter:  [[COMMAND: {"action":"filter","query":"term","category":"people|transactions|newsletters|notifications|promotions"}]]
- Select:  [[COMMAND: {"action":"select","emailId":"ID"}]]
- Archive: [[COMMAND: {"action":"archive","emailId":"ID"}]]
- Star:    [[COMMAND: {"action":"star","emailId":"ID"}]]

Be concise. Include command tags only when an action is specifically requested.`

  return callGeminiAPI(systemPrompt, messages)
}

/**
 * Priority summary — cached for 30 minutes to avoid repeated API calls.
 */
export async function generatePrioritySummary(emails = []) {
  if (!emails.length) return []

  // Build cache key from first 8 email IDs
  const cacheKey = `zwoop_priority_${emails.slice(0, 8).map(e => e.id).join('_')}`
  const cached = cacheGet(cacheKey)
  if (cached) { console.log('[AI] Priority summary served from cache'); return cached }

  // Limit to 8 emails to stay within token budget
  const sample = emails.slice(0, 8).map((e) =>
    `[ID: ${e.id}] From: ${e.senderName} | Subject: ${e.subject} | Snippet: ${(e.snippet || '').slice(0, 100)}`
  ).join('\n')

  const systemPrompt = `You identify high-priority emails (urgent actions, deadlines, OTPs, direct questions, payments).
Pick up to 3 top priority items from the list below.

Return a JSON array (inside a json codeblock) with these keys per item:
{ "id": "email_id", "senderName": "Name", "subject": "Subject", "urgency": "High"|"Medium"|"Urgent", "summary": "1-sentence summary", "suggestedAction": "What to do" }

Return ONLY the JSON array. No extra commentary.`

  try {
    const raw = await callGeminiAPI(systemPrompt, sample, { maxOutputTokens: 512 })
    const match = raw.match(/\[\s*\{[\s\S]*\}\s*\]/)
    if (match) {
      const result = JSON.parse(match[0])
      cacheSet(cacheKey, result)
      return result
    }
  } catch (err) {
    console.warn('[AI] Priority summary failed, using heuristics:', err?.title || err?.message)
  }

  // Heuristic fallback — no API call needed
  return emails.slice(0, 3).map(e => ({
    id: e.id,
    senderName: e.senderName || 'Sender',
    subject: e.subject || 'Important Email',
    urgency: e.isUnread ? 'High' : 'Medium',
    summary: e.snippet ? e.snippet.slice(0, 100) + '...' : 'Review this email.',
    suggestedAction: 'Open email to review details',
  }))
}

/**
 * Email categorization — cached per session to avoid re-running on every login.
 * Sends max 20 emails in one batch; processes rest with heuristics.
 */
export async function categorizeEmails(emails) {
  if (!emails.length) return []

  // Cache key based on the first 10 email IDs
  const cacheKey = `zwoop_categories_${emails.slice(0, 10).map(e => e.id).join('_')}`
  const cached = cacheGet(cacheKey)
  if (cached && cached.length === emails.length) {
    console.log('[AI] Email categories served from cache')
    return cached
  }

  // Only send first 20 emails to AI; rest get heuristic categorization
  const AI_BATCH_SIZE = 20
  const aiBatch = emails.slice(0, AI_BATCH_SIZE)
  const heuristicBatch = emails.slice(AI_BATCH_SIZE)

  const emailSummaries = aiBatch.map((e, i) =>
    `${i}. From: ${e.senderName} <${e.senderEmail}> | Subject: ${e.subject} | Snippet: ${e.snippet?.slice(0, 80)}`
  ).join('\n')

  const systemPrompt = `Categorize each email. For each, respond with ONLY one of these category names:
people | transactions | newsletters | notifications | promotions

One category per line, matching the email index. Just the category word.`

  let aiCategories = []
  try {
    const result = await aiComplete(systemPrompt, emailSummaries)
    aiCategories = result.trim().split('\n').map((line) => {
      const cleaned = line.replace(/^\d+\.\s*/, '').trim().toLowerCase()
      const valid = ['people', 'transactions', 'newsletters', 'notifications', 'promotions']
      return valid.includes(cleaned) ? cleaned : heuristicCategorize(aiBatch[aiCategories.length] || {})
    })
  } catch (err) {
    console.warn('[AI] Categorization API failed, using heuristics for all:', err?.title || err?.message)
    aiCategories = aiBatch.map(e => heuristicCategorize(e))
  }

  // Pad with heuristics if AI returned fewer lines than expected
  while (aiCategories.length < aiBatch.length) {
    aiCategories.push(heuristicCategorize(aiBatch[aiCategories.length]))
  }

  const heuristicCategories = heuristicBatch.map(e => heuristicCategorize(e))
  const allCategories = [...aiCategories, ...heuristicCategories]

  cacheSet(cacheKey, allCategories)
  return allCategories
}

/**
 * Detect urgent emails needing immediate attention.
 */
export async function detectUrgent(emails) {
  if (!emails.length) return []

  const emailSummaries = emails.slice(0, 8).map((e, i) =>
    `${i}. From: ${e.senderName} | Subject: ${e.subject} | Snippet: ${e.snippet?.slice(0, 100)}`
  ).join('\n')

  const systemPrompt = `For each email, reply "urgent" or "normal". One word per line.
Urgent = direct question, deadline, OTP, action required, payment due, real person expecting reply.`

  try {
    const result = await aiComplete(systemPrompt, emailSummaries)
    return result.trim().split('\n').map(line => line.trim().toLowerCase() === 'urgent')
  } catch {
    return emails.slice(0, 8).map(() => false)
  }
}

/**
 * AI-assisted email composition (rewrite tone, fix grammar, shorten, etc.)
 */
export async function composeAssist(text, action) {
  const actions = {
    professional: 'Rewrite in a professional, formal business tone. Preserve the core message.',
    casual:       'Rewrite in a casual, warm, conversational tone.',
    shorter:      'Make significantly shorter and more concise. Remove fluff, get to the point.',
    fix_grammar:  'Fix grammar, spelling, and punctuation. Keep the original tone.',
    friendly:     'Rewrite in a warm, friendly tone with genuine pleasantries.',
    urgent:       'Rewrite to convey urgency professionally.',
  }

  const systemPrompt = `You are an email writing assistant. ${actions[action] || actions.professional}
Return ONLY the rewritten email text. No explanations, no quotes, no markdown.`

  return aiComplete(systemPrompt, text)
}

/**
 * Parse natural language search into a Gmail search query.
 */
export async function parseSearchQuery(naturalQuery) {
  const systemPrompt = `Convert a natural language email search into a Gmail search query string.
Examples:
- "emails from John about project" → "from:john subject:project"
- "unread from last week" → "is:unread newer_than:7d"
- "emails with attachments" → "has:attachment"
Return ONLY the Gmail query string. Nothing else.`

  try {
    return await aiComplete(systemPrompt, naturalQuery)
  } catch {
    return naturalQuery
  }
}

// ─── Heuristic Categorizer (no API call) ──────────────────────────────────────

function heuristicCategorize(email) {
  const from    = email.senderEmail?.toLowerCase() || ''
  const subject = email.subject?.toLowerCase() || ''
  const snippet = email.snippet?.toLowerCase() || ''
  const combined = from + subject + snippet

  if (/order|shipping|delivered|receipt|invoice|payment|otp|verification|confirm/i.test(combined))
    return 'transactions'
  if (/sale|deal|offer|discount|off|coupon|promo|unsubscribe|marketing/i.test(combined))
    return 'promotions'
  if (/notification|alert|linkedin|facebook|twitter|instagram|github|slack/i.test(combined))
    return 'notifications'
  if (/newsletter|digest|weekly|monthly|blog|noreply|no-reply/i.test(combined))
    return 'newsletters'
  return 'people'
}
