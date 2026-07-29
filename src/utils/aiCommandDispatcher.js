/**
 * AI Command Dispatcher
 * Parses command directives from AI responses (Phi-4, Gemini, Groq) and executes
 * JS functions directly inside ZwoopMail.
 *
 * Handles all output formats Phi-4 / LLMs might produce:
 *  1. [[COMMAND: {...}]]          — canonical format
 *  2. [COMMAND: {...}]            — single bracket variant
 *  3. ```json { "action": ... }``` — code block
 *  4. Bare { "action": "compose", ... } JSON objects in text
 */

export function parseAICommands(text) {
  if (!text || typeof text !== 'string') return { cleanText: text || '', commands: [] }

  const commands = []
  const seen = new Set()

  function addCommand(parsed) {
    if (!parsed || !parsed.action) return
    const key = JSON.stringify(parsed)
    if (seen.has(key)) return
    seen.add(key)
    commands.push(parsed)
  }

  function tryParse(str) {
    try { return JSON.parse(str.trim()) } catch { return null }
  }

  // Pattern 1: [[COMMAND: {...}]] — canonical (double bracket)
  const p1 = /\[\[COMMAND:\s*(\{[\s\S]*?\})\s*\]\]/gi
  let m
  while ((m = p1.exec(text)) !== null) addCommand(tryParse(m[1]))

  // Pattern 2: [COMMAND: {...}] — single bracket (Phi-4 sometimes does this)
  const p2 = /\[COMMAND:\s*(\{[\s\S]*?\})\s*\]/gi
  while ((m = p2.exec(text)) !== null) addCommand(tryParse(m[1]))

  // Pattern 3: ```json { "action": ... }```
  const p3 = /```(?:json)?\s*(\{[\s\S]*?"action"[\s\S]*?\})\s*```/gi
  while ((m = p3.exec(text)) !== null) addCommand(tryParse(m[1]))

  // Pattern 4: Bare JSON objects containing "action" field (last resort)
  const p4 = /\{[^{}]*"action"\s*:\s*"(?:compose|reply|filter|select|archive|star)"[^{}]*\}/gi
  while ((m = p4.exec(text)) !== null) addCommand(tryParse(m[0]))

  // Strip all command patterns from display text
  const cleanText = text
    .replace(/\[\[COMMAND:\s*\{[\s\S]*?\}\s*\]\]/gi, '')
    .replace(/\[COMMAND:\s*\{[\s\S]*?\}\s*\]/gi, '')
    .replace(/```(?:json)?\s*\{[\s\S]*?"action"[\s\S]*?\}\s*```/gi, '')
    .trim()

  return { cleanText, commands }
}

/**
 * Execute parsed commands using MailContext handlers
 * Returns list of execution results
 */
export async function executeAICommand(cmd, mailHandlers) {
  const { action } = cmd
  const {
    toggleCompose,
    selectEmail,
    setActiveStream,
    dispatch,
    emails = [],
    selectedEmail,
    archiveEmail,
    toggleStarEmail,
  } = mailHandlers

  const actionType = action.toLowerCase()

  try {
    switch (actionType) {
      case 'compose':
      case 'compose_email': {
        const { to = '', subject = '', body = '' } = cmd
        if (toggleCompose) {
          toggleCompose({ to, subject, body })
        }
        return { success: true, message: `Opened Compose window for ${to || 'new recipient'}` }
      }

      case 'reply':
      case 'reply_email': {
        let targetId = cmd.emailId || cmd.id
        let targetEmail = emails.find(e => e.id === targetId) || selectedEmail

        const to = cmd.to || targetEmail?.senderEmail || ''
        const subject = cmd.subject || (targetEmail?.subject ? (targetEmail.subject.startsWith('Re:') ? targetEmail.subject : `Re: ${targetEmail.subject}`) : '')
        const body = cmd.body || ''

        if (toggleCompose) {
          toggleCompose({ to, subject, body })
        }
        return { success: true, message: `Prepared reply to ${to}` }
      }

      case 'filter':
      case 'filter_emails': {
        const { query = '', category = '' } = cmd
        if (category && setActiveStream) {
          setActiveStream(category)
        }
        if (dispatch) {
          dispatch({ type: 'SET_SEARCH', payload: query })
        }
        return { success: true, message: `Applied filter query: "${query || category}"` }
      }

      case 'select':
      case 'select_email': {
        const targetId = cmd.emailId || cmd.id
        const targetEmail = emails.find(e => e.id === targetId)
        if (targetEmail && selectEmail) {
          selectEmail(targetEmail)
          return { success: true, message: `Opened email "${targetEmail.subject}"` }
        }
        return { success: false, message: `Email not found with ID ${targetId}` }
      }

      case 'archive':
      case 'archive_email': {
        const targetId = cmd.emailId || cmd.id || selectedEmail?.id
        if (targetId && archiveEmail) {
          archiveEmail(targetId)
          return { success: true, message: `Archived email ${targetId}` }
        }
        return { success: false, message: `No email selected to archive` }
      }

      case 'star':
      case 'star_email': {
        const targetId = cmd.emailId || cmd.id
        const targetEmail = emails.find(e => e.id === targetId) || selectedEmail
        if (targetEmail && toggleStarEmail) {
          toggleStarEmail(targetEmail)
          return { success: true, message: `Toggled star for "${targetEmail.subject}"` }
        }
        return { success: false, message: `No email target found to star` }
      }

      default:
        return { success: false, message: `Unknown AI action: ${action}` }
    }
  } catch (err) {
    console.error('Error executing AI command:', err)
    return { success: false, message: `Execution failed: ${err.message}` }
  }
}
