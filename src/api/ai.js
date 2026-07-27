/*
 * AI API Wrapper
 * Handles email categorization and compose assistance via Groq or Gemini.
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || ''

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || ''

// Use Groq if available, otherwise Gemini
const useGroq = !!GROQ_API_KEY

/**
 * Generic AI completion call
 */
async function aiComplete(systemPrompt, userMessage) {
  if (useGroq) {
    return groqComplete(systemPrompt, userMessage)
  }
  return geminiComplete(systemPrompt, userMessage)
}

async function groqComplete(systemPrompt, userMessage) {
  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
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

async function geminiComplete(systemPrompt, userMessage) {
  const res = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userMessage }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
    }),
  })
  if (!res.ok) throw new Error('Gemini API call failed')
  const data = await res.json()
  return data.candidates[0].content.parts[0].text
}

/**
 * Categorize a batch of emails into streams.
 * Returns an array of categories: people, transactions, newsletters, notifications, promotions
 */
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

/**
 * Detect which emails need urgent attention
 */
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

/**
 * AI-assisted email composition
 */
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

/**
 * Parse natural language search into Gmail query
 */
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
    return naturalQuery // Fallback to raw query
  }
}

/**
 * Fallback heuristic categorization (no AI needed)
 */
function heuristicCategorize(email) {
  const from = email.senderEmail?.toLowerCase() || ''
  const subject = email.subject?.toLowerCase() || ''
  const snippet = email.snippet?.toLowerCase() || ''

  // Transactions
  if (/order|shipping|delivered|receipt|invoice|payment|otp|verification|confirm/i.test(subject + snippet)) {
    return 'transactions'
  }

  // Promotions
  if (/sale|deal|offer|discount|off|coupon|promo|unsubscribe/i.test(subject + snippet)) {
    return 'promotions'
  }

  // Notifications
  if (/notification|alert|update|linkedin|facebook|twitter|instagram/i.test(from + subject)) {
    return 'notifications'
  }

  // Newsletters
  if (/newsletter|digest|weekly|monthly|blog|noreply|no-reply/i.test(from + subject)) {
    return 'newsletters'
  }

  // Default: people
  return 'people'
}
