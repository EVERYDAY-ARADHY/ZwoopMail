/*
 * AI API Wrapper — Azure Phi-4 (phi-mini)
 * Always calls /api/ai proxy.
 * Includes: request queue (mutex), TTL response cache, refined prompts.
 */

const PROXY_URL = '/api/ai'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// ─── Response Cache ───────────────────────────────────────────────────────────
const aiCache = new Map()

function getCacheKey(systemPrompt, userMessage) {
  // Lightweight fingerprint — first 80 chars of each side is enough for uniqueness
  return `${systemPrompt.slice(0, 80)}||${userMessage.slice(0, 120)}`
}

function getCached(key) {
  const entry = aiCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    aiCache.delete(key)
    return null
  }
  return entry.value
}

function setCache(key, value) {
  aiCache.set(key, { value, ts: Date.now() })
}

// ─── Retry Helper ────────────────────────────────────────────────────────────
async function fetchWithRetry(url, options, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options)
    if (res.status === 429 && attempt < maxRetries) {
      // Azure often sends long Retry-After headers (e.g. 60s).
      // Cap our wait to 4 seconds max to avoid freezing UI.
      const waitMs = Math.min(2000 * (attempt + 1), 4000)
      console.warn(`[ZwoopAI] Rate limited. Retrying in ${waitMs / 1000}s (attempt ${attempt + 1}/${maxRetries})`)
      await new Promise(r => setTimeout(r, waitMs))
      continue
    }
    return res
  }
}

// ─── Global AI Request Queue (Mutex) ─────────────────────────────────────────
// Prevents concurrent requests to Azure Phi to avoid 429 collisions.
let aiQueue = Promise.resolve()

function enqueueTask(taskFn) {
  return new Promise((resolve, reject) => {
    aiQueue = aiQueue.then(async () => {
      try {
        const result = await taskFn()
        resolve(result)
      } catch (err) {
        reject(err)
      }
      // Cooldown between requests to respect TPM limits
      await new Promise(r => setTimeout(r, 1000))
    })
  })
}

// ─── Core Completion (with Cache) ────────────────────────────────────────────
async function aiComplete(systemPrompt, userMessage, { useCache = true } = {}) {
  const cacheKey = getCacheKey(systemPrompt, userMessage)

  if (useCache) {
    const cached = getCached(cacheKey)
    if (cached !== null) {
      console.info('[ZwoopAI Cache HIT]', cacheKey.slice(0, 60) + '…')
      return cached
    }
  }

  return enqueueTask(async () => {
    const res = await fetchWithRetry(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 512,
      }),
    })

    if (!res.ok) {
      const errorText = await res.text()
      throw new Error(`Phi-mini error (${res.status}): ${errorText}`)
    }

    const data = await res.json()
    const result = data.choices[0].message.content

    if (useCache) setCache(cacheKey, result)
    return result
  })
}

// ─── Robust JSON Extractor ────────────────────────────────────────────────────
// Handles markdown fences, leading text, object wrappers ({"ids":[...]}) and
// partial wrapping from the model.
function parseJsonResponse(raw) {
  let cleaned = raw.trim()

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  // Try to find and parse the outermost JSON array first
  const firstBracket = cleaned.indexOf('[')
  const lastBracket = cleaned.lastIndexOf(']')
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    try {
      return JSON.parse(cleaned.slice(firstBracket, lastBracket + 1))
    } catch { /* fall through to object parse */ }
  }

  // Model may have wrapped in an object: {"ids":[...]} / {"result":[...]} / {"emails":[...]}
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      const obj = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1))
      // Pick the first array-valued property
      const arrayVal = Object.values(obj).find(v => Array.isArray(v))
      if (arrayVal) return arrayVal
    } catch { /* fall through */ }
  }

  return JSON.parse(cleaned) // last attempt — may throw
}

// ─── Email Thread Cleaner ────────────────────────────────────────────────────
// Strips quoted replies, forwarded headers, and automated boilerplates.
export function cleanEmailThread(text) {
  if (!text) return '';
  let cleaned = text;

  const markers = [
    /\nOn .*? wrote:/i,
    /_{10,} Original Message _{10,}/i,
    /-------- Original Message --------/i,
    /\nFrom: .*?\nTo: .*?\nDate: /i
  ];
  for (const marker of markers) {
    const match = cleaned.match(marker);
    if (match) {
      cleaned = cleaned.substring(0, match.index);
    }
  }

  cleaned = cleaned.replace(/CAUTION: This email originated from outside.*?safe\./gi, '');
  cleaned = cleaned.split('\n').filter(line => !line.trim().startsWith('>')).join('\n');

  const sigMatch = cleaned.match(/\n--\s*\n/);
  if (sigMatch) {
    cleaned = cleaned.substring(0, sigMatch.index);
  }

  return cleaned.trim();
}

// ─── Streaming Chat ──────────────────────────────────────────────────────────
// NOTE: Intentionally NOT wrapped in enqueueTask — SSE streaming is asynchronous
// by nature and must run outside the serial mutex. The mutex would fire its
// cooldown timer mid-stream, causing overlapping concurrent reads.
export async function streamChatWithAI(chatMessages, emailContext, onChunk) {
  // Build compact context — up to 4 emails, 800 chars each
  const ctx = (emailContext || []).slice(0, 4).map(e => {
    const rawText = e.bodyText || e.snippet || '';
    const cleaned = cleanEmailThread(rawText);
    return `[ID:${e.id}] From: ${e.senderName} | Subject: ${e.subject}\n${cleaned.slice(0, 800)}`;
  }).join('\n\n---\n\n')

  const systemPrompt = `You are Zwoop AI, a smart email assistant. You have direct access to the user's emails shown below.
Answer concisely. If info isn't in the context, say "I couldn't find that in your recent emails" — do not claim you lack access.

EMAILS IN CONTEXT:
${ctx || '(No emails provided for this query)'}

AGENTIC ACTIONS: If asked to draft or reply to an email, output a tag on its own line:
<agent>{"action":"DRAFT_REPLY","emailId":"<exact-id>","content":"<full draft body>"}</agent>
For viewing a specific email output:
<agent>{"action":"VIEW_MAIL","emailId":"<exact-id>"}</agent>
Always include a brief natural-language note before the tag explaining what you are doing.`

  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatMessages.map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text })),
  ]

  const res = await fetchWithRetry(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Raised to 1024 so agent tags are never truncated mid-stream
    body: JSON.stringify({ messages, temperature: 0.4, max_tokens: 1024, stream: true }),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Phi-mini stream error (${res.status}): ${errorText}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    for (const line of chunk.split('\n')) {
      if (!line.startsWith('data: ') || line.trim() === 'data: [DONE]') continue
      try {
        const data = JSON.parse(line.slice(6))
        if (data.choices?.[0]?.delta?.content) onChunk(data.choices[0].delta.content)
      } catch { /* partial SSE chunk — safe to ignore */ }
    }
  }
}

// ─── Email Categorization ────────────────────────────────────────────────────
// Directly uses heuristics to avoid burning TPM quota on every app load.
export async function categorizeEmails(emails) {
  if (!emails.length) return []
  return emails.map(e => heuristicCategorize(e))
}

// ─── Urgency Detection ───────────────────────────────────────────────────────
export async function detectUrgent(emails) {
  if (!emails.length) return []
  const summaries = emails.slice(0, 5).map((e, i) => `${i}. ${e.senderName}: ${e.subject}`).join('\n')

  try {
    const result = await aiComplete(
      'Classify each email as "urgent" or "normal". Reply with exactly one word per line, in the same order as input.',
      summaries
    )
    return result.trim().split('\n').map(l => l.trim().toLowerCase() === 'urgent')
  } catch (err) {
    console.error('[ZwoopAI] detectUrgent failed:', err)
    return emails.slice(0, 5).map(() => false)
  }
}

// ─── Compose Assist ──────────────────────────────────────────────────────────
export async function composeAssist(text, action) {
  const actions = {
    professional: 'Rewrite professionally.',
    casual: 'Rewrite casually.',
    shorter: 'Make significantly shorter.',
    fix_grammar: 'Fix grammar and spelling only.',
    friendly: 'Rewrite in a warm, friendly tone.',
    urgent: 'Rewrite to clearly convey urgency.',
  }
  return aiComplete(
    `${actions[action] || actions.professional} Return ONLY the rewritten text, no commentary or labels.`,
    text
  )
}

// ─── Search Query Parser ─────────────────────────────────────────────────────
export async function parseSearchQuery(naturalQuery) {
  try {
    return await aiComplete(
      'Convert the following natural language query into a Gmail search operator string. Return ONLY the query string.',
      naturalQuery
    )
  } catch {
    return naturalQuery
  }
}

// ─── Email Analysis (Summary / Inbox Overview Tab) ───────────────────────────
export async function analyzeTodaysEmails(emails) {
  if (!emails || !emails.length) return []

  const now = Date.now()
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000

  // Try last 7 days first; fall back to the most recent 10 emails if window is empty
  let targetEmails = emails.filter(e => e.date && (now - new Date(e.date).getTime()) < sevenDaysMs)
  if (targetEmails.length === 0) {
    console.info('[ZwoopAI] No emails in last 7 days — using most recent 10 as fallback')
    targetEmails = emails.slice(0, 10)
  }
  targetEmails = targetEmails.slice(0, 10)

  // Use email IDs as a cache fingerprint — skip the AI call if we already analyzed this exact set
  const fingerprint = `analyze||${targetEmails.map(e => e.id).join(',')}`
  const cached = getCached(fingerprint)
  if (cached !== null) {
    console.info('[ZwoopAI Cache HIT] analyzeTodaysEmails')
    return cached
  }

  const summaries = targetEmails.map(e =>
    `ID:${e.id} | From:${e.senderName} | Subject:${e.subject} | Preview:${(e.snippet || '').slice(0, 120)}`
  ).join('\n')

  const systemPrompt = `You are an email triage assistant. Analyze the provided emails and return a JSON array.

STRICT RULES:
- Output ONLY a raw JSON array — no markdown, no code fences, no explanation.
- Each item must have exactly these fields:
  {"id":"<exact id from input>","urgency":"high"|"medium"|"low","summary":"one concise sentence","actionItem":"specific next action, or null"}
- Urgency guide: "high" = deadlines/payments/urgent requests; "medium" = replies needed soon; "low" = informational only.
- Use the exact ID string from the input — do not modify it.`

  try {
    const response = await aiComplete(systemPrompt, summaries, { useCache: false })
    const parsed = parseJsonResponse(response)
    const result = Array.isArray(parsed) ? parsed : []
    // Cache successful results keyed by email fingerprint
    if (result.length > 0) setCache(fingerprint, result)
    return result
  } catch (err) {
    console.error('[ZwoopAI] analyzeTodaysEmails failed:', err)
    return []
  }
}

// ─── Deep Search / RAG ID Retrieval ──────────────────────────────────────────
export async function retrieveRelevantEmailIds(query, lightWeightEmails) {
  if (!lightWeightEmails || !lightWeightEmails.length) return []

  // Cache per query + email-set so repeated identical searches skip the API call
  const cacheKey = getCacheKey('retrieve-ids||' + query, lightWeightEmails.map(e => e.id).join(','))
  const cached = getCached(cacheKey)
  if (cached !== null) {
    console.info('[ZwoopAI Cache HIT] retrieveRelevantEmailIds')
    return cached
  }

  const systemPrompt = `Given a JSON list of emails (id, subject, sender, date), return a JSON array of up to 3 email ID strings most relevant to the user's query.
Return ONLY the JSON array of strings — e.g. ["id1","id2"]. No markdown, no explanation.`

  try {
    const response = await aiComplete(
      systemPrompt,
      `Query: ${query}\n\nEmails: ${JSON.stringify(lightWeightEmails)}`,
      { useCache: false }
    )
    const parsed = parseJsonResponse(response)
    const result = Array.isArray(parsed) ? parsed : []
    setCache(cacheKey, result)
    return result
  } catch (err) {
    console.error('[ZwoopAI] retrieveRelevantEmailIds failed:', err)
    return []
  }
}

// ─── Heuristic Fallback Categorizer ──────────────────────────────────────────
function heuristicCategorize(email) {
  const s = (email.subject || '') + (email.snippet || '') + (email.senderEmail || '')
  if (/order|shipping|receipt|invoice|payment|otp|verification/i.test(s)) return 'transactions'
  if (/sale|deal|offer|discount|coupon|promo|unsubscribe/i.test(s)) return 'promotions'
  if (/notification|alert|linkedin|facebook|twitter|instagram/i.test(s)) return 'notifications'
  if (/newsletter|digest|weekly|noreply|no-reply/i.test(s)) return 'newsletters'
  return 'people'
}
