// Vercel Serverless Function — AI Proxy for Azure Phi-4
// Keeps API key server-side (secure) and bypasses CORS

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const API_KEY = process.env.AZURE_PHI4_API_KEY
  const ENDPOINT = process.env.AZURE_PHI4_ENDPOINT

  if (!API_KEY || !ENDPOINT) {
    return res.status(500).json({ error: 'Azure Phi-4 credentials not configured on server' })
  }

  const { messages, temperature = 0.3, max_tokens = 1024, stream = false } = req.body

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' })
  }

  const azureUrl = `${ENDPOINT}/chat/completions?api-version=2024-12-01-preview`

  try {
    if (stream) {
      // Streaming response
      const azureRes = await fetch(azureUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': API_KEY,
        },
        body: JSON.stringify({ messages, temperature, max_tokens, stream: true }),
      })

      if (!azureRes.ok) {
        const errorBody = await azureRes.text()
        return res.status(azureRes.status).json({ error: `Azure API error: ${azureRes.statusText}`, details: errorBody })
      }

      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')

      const reader = azureRes.body.getReader()
      const decoder = new TextDecoder('utf-8')

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        res.write(chunk)
      }

      res.end()
    } else {
      // Non-streaming response
      const azureRes = await fetch(azureUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': API_KEY,
        },
        body: JSON.stringify({ messages, temperature, max_tokens }),
      })

      if (!azureRes.ok) {
        const errorBody = await azureRes.text()
        return res.status(azureRes.status).json({ error: `Azure API error: ${azureRes.statusText}`, details: errorBody })
      }

      const data = await azureRes.json()
      return res.status(200).json(data)
    }
  } catch (err) {
    console.error('AI Proxy Error:', err)
    return res.status(500).json({ error: 'Internal proxy error', message: err.message })
  }
}
