/*
 * AI API Wrapper — Azure Phi-4 (phi-mini)
 * Always calls /api/ai proxy. Minimal prompts for low TPM quota.
 */

const PROXY_URL = '/api/ai'

// ─── Retry Helper ────────────────────────────────────────────────────────────
async function fetchWithRetry(url, options, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options)
    if (res.status === 429 && attempt < maxRetries) {
      // Azure often sends long Retry-After headers (e.g. 60s). 
      // Waiting 60s freezes the UI. We will cap our wait to 4 seconds max.
      const waitMs = Math.min(2000 * (attempt + 1), 4000)
      console.warn(`Rate limited. Fast-retrying in ${waitMs / 1000}s (${attempt + 1}/${maxRetries})`)
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
      // Cooldown to respect TPM limits
      await new Promise(r => setTimeout(r, 1000))
    })
  })
}

// ─── Core Completion ─────────────────────────────────────────────────────────
async function aiComplete(systemPrompt, userMessage) {
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
    return data.choices[0].message.content
  })
}

// ─── Streaming Chat ──────────────────────────────────────────────────────────
export async function streamChatWithAI(chatMessages, emailContext, onChunk) {
  return enqueueTask(async () => {
    const ctx = (emailContext || []).slice(0, 3).map(e => `• ID:${e.id} From:${e.senderName} Sub:${e.subject}\nBody: ${(e.snippet || '').slice(0, 400)}`).join('\n\n')

    const messages = [
      { role: 'system', content: `You are Zwoop AI, an email assistant. Be concise.
Recent emails:
${ctx}

AGENTIC CAPABILITIES:
If the user asks you to DRAFT an email, you must output a JSON block wrapped in <agent> tags like this:
<agent>{"action": "DRAFT_REPLY", "emailId": "the-id", "content": "The drafted body"}</agent>
Include some conversational text before or after the tag.` },
      ...chatMessages.map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text })),
    ]

    const res = await fetchWithRetry(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, temperature: 0.5, max_tokens: 800, stream: true }),
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
        } catch { /* partial chunk */ }
      }
    }
  })
}

// ─── Email Categorization ────────────────────────────────────────────────────
export async function categorizeEmails(emails) {
  if (!emails.length) return []
  
  // Directly use heuristics to avoid destroying the Phi-4 TPM quota on app load
  return emails.map(e => heuristicCategorize(e))
}

// ─── Urgency Detection ───────────────────────────────────────────────────────
export async function detectUrgent(emails) {
  if (!emails.length) return []
  const summaries = emails.slice(0, 5).map((e, i) => `${i}. ${e.senderName}: ${e.subject}`).join('\n')

  try {
    const result = await aiComplete(
      'For each email reply "urgent" or "normal". One word per line.',
      summaries
    )
    return result.trim().split('\n').map(l => l.trim().toLowerCase() === 'urgent')
  } catch {
    return emails.slice(0, 5).map(() => false)
  }
}

// ─── Compose Assist ──────────────────────────────────────────────────────────
export async function composeAssist(text, action) {
  const actions = {
    professional: 'Rewrite professionally.',
    casual: 'Rewrite casually.',
    shorter: 'Make shorter.',
    fix_grammar: 'Fix grammar.',
    friendly: 'Rewrite friendly.',
    urgent: 'Rewrite urgently.',
  }
  return aiComplete(`${actions[action] || actions.professional} Return ONLY the rewritten text.`, text)
}

// ─── Search Query Parser ─────────────────────────────────────────────────────
export async function parseSearchQuery(naturalQuery) {
  try {
    return await aiComplete('Convert to Gmail search query. Return ONLY the query.', naturalQuery)
  } catch {
    return naturalQuery
  }
}

// ─── Past 5 Emails Analysis (Now Today's Emails) ───────────────────────────────
export async function analyzeTodaysEmails(emails) {
  if (!emails || !emails.length) return []

  // Filter for emails within the last 24 hours
  const now = Date.now()
  const oneDayMs = 24 * 60 * 60 * 1000
  const todaysEmails = emails.filter(e => {
    if (!e.date) return false
    const d = new Date(e.date).getTime()
    return (now - d) < oneDayMs
  })

  // Limit to at most 10 emails to keep token count reasonable
  const targetEmails = todaysEmails
  if (targetEmails.length === 0) return []

  const summaries = targetEmails.map(e =>
    `ID:${e.id} From:${e.senderName} Sub:${e.subject} Snip:${(e.snippet || '').slice(0, 100)}`
  ).join('\n')

  try {
    const response = await aiComplete(
      'You are an email analyzer. Return ONLY a valid JSON array. Do not include markdown code blocks. Each object in the array must have: {id: string, urgency: "high"|"medium"|"low", summary: "1 short sentence", actionItem: "short action or No action needed"}.',
      summaries
    )
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

// ─── Deep Search / RAG ID Retrieval ──────────────────────────────────────────
export async function retrieveRelevantEmailIds(query, lightWeightEmails) {
  if (!lightWeightEmails || !lightWeightEmails.length) return []
  
  const payloadStr = JSON.stringify(lightWeightEmails)
  const systemPrompt = `You are a search assistant. You are given a JSON array of emails (id, subject, sender, date). You must return a strict JSON array of STRING IDs (e.g. ["id1", "id2"]) that might contain the answer to the user's query. Return ONLY the JSON array. Limit to maximum 3 most relevant IDs.`
  
  try {
    const response = await aiComplete(systemPrompt, `Query: ${query}\nEmails: ${payloadStr}`)
    let cleaned = response.trim()
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7)
    if (cleaned.startsWith('```')) cleaned = cleaned.slice(3)
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3)
    
    const parsed = JSON.parse(cleaned.trim())
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.error('ID retrieval failed:', err)
    return []
  }
}

// ─── Heuristic Fallback ──────────────────────────────────────────────────────
function heuristicCategorize(email) {
  const s = (email.subject || '') + (email.snippet || '') + (email.senderEmail || '')
  if (/order|shipping|receipt|invoice|payment|otp|verification/i.test(s)) return 'transactions'
  if (/sale|deal|offer|discount|coupon|promo|unsubscribe/i.test(s)) return 'promotions'
  if (/notification|alert|linkedin|facebook|twitter|instagram/i.test(s)) return 'notifications'
  if (/newsletter|digest|weekly|noreply|no-reply/i.test(s)) return 'newsletters'
  return 'people'
}
