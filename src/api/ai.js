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
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Add a 25s abort timeout per attempt so hung requests never freeze the UI
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25000)

    let res
    try {
      res = await fetch(url, { ...options, signal: controller.signal })
    } catch (err) {
      clearTimeout(timeoutId)
      // Network-level errors (TypeError: Failed to fetch, AbortError from timeout)
      if (attempt < maxRetries) {
        const waitMs = 800 * (attempt + 1)
        console.warn(`[ZwoopAI] Network error on attempt ${attempt + 1}: ${err.message}. Retrying in ${waitMs}ms…`)
        await new Promise(r => setTimeout(r, waitMs))
        continue
      }
      throw new Error(`Network error after ${maxRetries + 1} attempts: ${err.message}`)
    }
    clearTimeout(timeoutId)

    // Retry on rate-limit (429) or server errors (5xx)
    if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
      const waitMs = Math.min(1500 * (attempt + 1), 4000)
      console.warn(`[ZwoopAI] HTTP ${res.status}. Retrying in ${waitMs / 1000}s (attempt ${attempt + 1}/${maxRetries})`)
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
      // Reduced from 1000ms → 350ms: respects TPM limits while feeling ~2× faster
      await new Promise(r => setTimeout(r, 350))
    })
  })
}

// ─── Core Completion (with Cache) ────────────────────────────────────────────
async function aiComplete(systemPrompt, userMessage, { useCache = true, maxTokens = 512 } = {}) {
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
        max_tokens: maxTokens,
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

AGENTIC ACTIONS — MANDATORY FORMAT:
If the user asks you to draft or reply to an email, you MUST output the following tag on its own line.
Do NOT write the draft reply as plain text in your response — always use the tag.
The tag must be on its own line, with EXACT syntax:
<agent>{"action":"DRAFT_REPLY","emailId":"<exact-id>","content":"<full draft body>"}</agent>
For viewing a specific email output:
<agent>{"action":"VIEW_MAIL","emailId":"<exact-id>"}</agent>
Always include a brief natural-language sentence BEFORE the tag explaining what you are doing.
NEVER put the draft text outside the tag. NEVER skip the tag when drafting.`

  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatMessages.map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text })),
  ]

  const res = await fetchWithRetry(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, temperature: 0.4, max_tokens: 1024, stream: true }),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Phi-mini stream error (${res.status}): ${errorText}`)
  }

  // ── Streaming path (Chrome / Firefox / Edge) ──────────────────────────────
  if (res.body && typeof res.body.getReader === 'function') {
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
    return
  }

  // ── Non-streaming fallback (Safari on macOS / older environments) ──────────
  // Re-request without stream:true so we get a normal JSON response
  console.warn('[ZwoopAI] ReadableStream not supported — falling back to non-streaming fetch')
  const fallbackRes = await fetchWithRetry(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, temperature: 0.4, max_tokens: 1024, stream: false }),
  })
  if (!fallbackRes.ok) {
    const errorText = await fallbackRes.text()
    throw new Error(`Phi-mini fallback error (${fallbackRes.status}): ${errorText}`)
  }
  const fallbackData = await fallbackRes.json()
  const fullText = fallbackData.choices?.[0]?.message?.content || ''
  // Deliver as a single chunk so callers work identically
  if (fullText) onChunk(fullText)
}

// ─── Draft Reply Streamer (no agent tags — for AI Draft Reply flow) ───────────
// Intentionally separate from streamChatWithAI so the model receives a plain
// writing prompt with no "use <agent> tags" instructions that would fight the
// user request and produce empty or tag-wrapped output.
export async function streamDraftReply(email, userContext, onChunk) {
  const emailPreview = cleanEmailThread(email.bodyText || email.snippet || '').slice(0, 600)

  const contextLine = userContext?.trim()
    ? `\nUser's instructions for this reply: ${userContext.trim()}`
    : ''

  const systemPrompt = `You are an expert email writer. Write a reply to the email below.${contextLine}
RULES:
- Return ONLY the reply body text. No subject, no labels, no tags, no explanations.
- Do not wrap in quotes or code blocks.
- Match the tone and formality of the original email unless instructed otherwise.`

  const userMessage = `From: ${email.senderName}
Subject: ${email.subject}
---
${emailPreview}
---
Write the reply body now.`

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userMessage },
  ]

  const res = await fetchWithRetry(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, temperature: 0.45, max_tokens: 800, stream: true }),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Draft reply stream error (${res.status}): ${errorText}`)
  }

  // Streaming path (Chrome / Firefox / Edge)
  if (res.body && typeof res.body.getReader === 'function') {
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
    return
  }

  // Non-streaming fallback (Safari / macOS)
  console.warn('[ZwoopAI] streamDraftReply: ReadableStream not supported — using fallback')
  const fallbackRes = await fetchWithRetry(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, temperature: 0.45, max_tokens: 800, stream: false }),
  })
  if (!fallbackRes.ok) {
    const errorText = await fallbackRes.text()
    throw new Error(`Draft reply fallback error (${fallbackRes.status}): ${errorText}`)
  }
  const fallbackData = await fallbackRes.json()
  const body = fallbackData.choices?.[0]?.message?.content || ''
  if (body) onChunk(body)
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
    professional: 'Rewrite the following draft in a professional, formal business tone.',
    casual:       'Rewrite the following draft in a relaxed, casual conversational tone.',
    shorter:      'Make the following draft significantly shorter while keeping the core message.',
    fix_grammar:  'Fix all grammar, spelling, and punctuation errors in the following draft. Change nothing else.',
    friendly:     'Rewrite the following draft in a warm, friendly, approachable tone.',
    urgent:       'Rewrite the following draft to clearly convey urgency and importance.',
  }
  const instruction = actions[action] || actions.professional
  return aiComplete(
    `${instruction}

CRITICAL RULES:
- You are editing/rewriting a DRAFT that the user is composing. This is NOT a reply task.
- Do NOT generate a reply to any quoted email, do NOT add greetings or sign-offs, do NOT add new content.
- Return ONLY the rewritten draft text. No labels, no explanations, no surrounding quotes.`,
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

  // Try last 7 days first; fall back to most recent emails if window is empty
  let targetEmails = emails.filter(e => e.date && (now - new Date(e.date).getTime()) < sevenDaysMs)
  if (targetEmails.length === 0) {
    console.info('[ZwoopAI] No emails in last 7 days — using most recent as fallback')
    targetEmails = emails.slice(0, 7)
  }
  // Cap at 7 (was 10): fewer emails = faster response + smaller chance of truncated JSON
  targetEmails = targetEmails.slice(0, 7)

  // Skip API if we already have results for this exact email set
  const fingerprint = `analyze||${targetEmails.map(e => e.id).join(',')}`
  const cached = getCached(fingerprint)
  if (cached !== null) {
    console.info('[ZwoopAI Cache HIT] analyzeTodaysEmails')
    return cached
  }

  // Compact summary: 100 char preview is enough for triage
  const summaries = targetEmails.map(e =>
    `ID:${e.id} | From:${e.senderName} | Subj:${e.subject} | ${(e.snippet || '').slice(0, 100)}`
  ).join('\n')

  const systemPrompt = `Email triage assistant. Analyze these emails. Return a raw JSON array — no markdown, no fences.
Each item: {"id":"<exact id>","urgency":"high"|"medium"|"low","summary":"one sentence","actionItem":"next action or null"}
Urgency: high=deadlines/payments/urgent; medium=reply needed; low=info only.
Copy the id string exactly as given.`

  try {
    const response = await aiComplete(systemPrompt, summaries, { useCache: false, maxTokens: 900 })
    const parsed = parseJsonResponse(response)
    const result = Array.isArray(parsed) ? parsed : []
    if (result.length > 0) setCache(fingerprint, result)
    return result
  } catch (err) {
    console.error('[ZwoopAI] analyzeTodaysEmails failed:', err)
    // Graceful degradation: return stub cards so UI never goes empty
    return targetEmails.map(e => ({
      id: e.id,
      urgency: 'medium',
      summary: e.snippet ? e.snippet.slice(0, 80) + '…' : 'No preview available.',
      actionItem: null,
    }))
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
