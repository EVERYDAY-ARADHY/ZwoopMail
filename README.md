# ZwoopMail ✦

> **Email, reimagined.** The calm, AI-powered inbox you deserve.  
> No clutter. No anxiety. Just your email.

🔗 **Live** → [zwoopmail.xyz](https://zwoopmail.xyz)  
Built for **Overclock Delhi '26**

---

## What is ZwoopMail?

ZwoopMail is a next-generation Gmail client that reimagines how you interact with your inbox. Instead of a wall of unread emails, you get **AI-sorted streams**, **chat-style reading**, and an intelligent assistant that actually understands your email — all wrapped in a dark, editorial design aesthetic.

---

## ✦ Design Philosophy

| Principle | How it shows up |
|---|---|
| **Calm over chaos** | No unread counts screaming at you — just clean streams |
| **Chat-native** | Emails render as conversation bubbles, not documents |
| **AI-first** | Intelligence is baked in, not bolted on |
| **Terminal aesthetic** | Monospace accents, ASCII art, ember orange on obsidian black |
| **Zero friction** | One click to sign in, instant load, no config |

### Color System
- `#FC5000` — Ember orange (primary accent, CTAs, AI highlights)
- `#0A0A0A` — Obsidian black (background)
- `#F5F0EB` — Off-white (text on dark)
- Monospace: `JetBrains Mono` · Display: `Barlow Condensed` · Body: `Inter`

---

## 🗺️ App Flow

```
┌─────────────────────────────────────────────────────────┐
│                     LOGIN SCREEN                        │
│  3D ASCII Angel Sculpture (Three.js) + ZWOOP MAIL logo  │
│  → Sign in with Google OAuth (Gmail read/write scope)   │
└──────────────────────┬──────────────────────────────────┘
                       │ accessToken
                       ▼
┌─────────────────────────────────────────────────────────┐
│                    MAIN APP LAYOUT                      │
│  ┌──────────┐  ┌────────────────┐  ┌─────────────────┐  │
│  │ Sidebar  │  │  Email List    │  │   Email View    │  │
│  │          │  │                │  │                 │  │
│  │ • ZWOOP  │  │ NEEDS          │  │ Chat-bubble     │  │
│  │   logo   │  │ ATTENTION (AI) │  │ thread view     │  │
│  │          │  │ ─────────────  │  │                 │  │
│  │ STREAMS  │  │ Regular inbox  │  │ Action bar:     │  │
│  │ People   │  │ stream sorted  │  │ Reply/Fwd/Star  │  │
│  │ Transact │  │ by AI category │  │ Archive/Unread  │  │
│  │ Newsltr  │  │                │  │ ✦ Vibe Check   │  │
│  │ Notifs   │  │                │  │                 │  │
│  │ Promos   │  │                │  │ FloatingChat DM │  │
│  │          │  │                │  │ panel (replies  │  │
│  │ ✦ Ask It │  │                │  │ via Gmail API)  │  │
│  │  (AI CTA)│  │                │  │                 │  │
│  └──────────┘  └────────────────┘  └─────────────────┘  │
│                        TopBar: Search + Quick dropdown   │
└─────────────────────────────────────────────────────────┘
```

---

## 🧠 AI Features

### 1. Stream Categorization
Every email is classified by a heuristic engine into one of 5 streams:

| Stream | What goes here |
|---|---|
| **People** | Real humans — conversations, replies |
| **Transactions** | Orders, receipts, OTPs, invoices |
| **Newsletters** | Digests, no-reply subscriptions |
| **Notifications** | Alerts from LinkedIn, GitHub, apps |
| **Promotions** | Deals, discounts, marketing |

### 2. Needs Attention (AI Detected)
The top of every stream shows emails flagged as urgent by the AI — deadlines, action requests, payment alerts.

### 3. Ask It — Zwoop Intelligence
A full conversational AI assistant (powered by **Azure Phi-4 mini**) that:
- Answers questions about your emails ("what did MongoDB send me?")
- Drafts replies on command via `<agent>` action tags
- Jumps directly to a specific email (`VIEW_MAIL` action)
- Streams responses token-by-token (SSE)

### 4. AI Search
Type a natural language query in the search bar and press `↵` — it's parsed into Gmail search syntax automatically.

### 5. ✦ Vibe Check
Click **Vibe Check** on any email to get a funny 50-word Gen Z summary of what the email actually says.

---

## 💬 FloatingChat — DM Panel

When you open an email, a chat window appears at the bottom right. It:
- Loads the **full Gmail thread** as bubbles
- Lets you **type and send real email replies** via the Gmail API
- Detects attachments and shows a jump-to-file shortcut
- Differentiates "you" vs "them" with bubble alignment (iMessage-style)

---

## 🏗️ Tech Stack

| Layer | Tech |
|---|---|
| **Frontend** | React 18 + Vite |
| **Styling** | Vanilla CSS (custom design system via CSS variables) |
| **3D / ASCII** | Three.js + custom ASCII renderer (`AsciiSculpture`) |
| **Auth** | Google OAuth 2.0 (`@react-oauth/google`) |
| **Email API** | Gmail REST API (read, send, thread, attachments) |
| **AI** | Azure Phi-4 mini via `/api/ai` proxy |
| **Deployment** | Vercel (serverless functions for AI proxy) |
| **Domain** | `zwoopmail.xyz` (gen.xyz) |

---

## 📁 Project Structure

```
src/
├── api/
│   ├── ai.js          # All AI functions: categorize, search, vibe, chat
│   └── gmail.js       # Gmail REST wrappers: fetch, send, thread, attach
├── components/
│   ├── AIChat/        # Zwoop Intelligence modal (streaming chat)
│   ├── Auth/          # Login screen (OAuth + Demo mode)
│   ├── Compose/       # New email composer with AI assist toolbar
│   ├── EmailList/     # Stream inbox + NeedsAttention banner
│   ├── EmailView/     # Chat-bubble email reader + Vibe Check
│   ├── FloatingChat/  # DM-style reply panel (per thread)
│   ├── Layout/        # Sidebar, TopBar
│   └── shared/        # Button, Avatar, AsciiSculpture, StreamBadge, etc.
├── context/
│   └── MailContext.jsx # Global state: emails, streams, auth, compose
└── utils/
    └── mockData.js    # Demo mode email fixtures
```

---

## ⚡ Key UX Decisions

**Why chat bubbles for email?**  
Email is conversation. Threading it as bubbles collapses the "wall of text" feeling and makes it feel instant and human.

**Why streams instead of folders?**  
Folders require manual work. Streams are AI-sorted automatically — you just pick your headspace (people / money / news / noise).

**Why the ASCII sculpture on the login screen?**  
It's a 3D angel model rendered in real-time ASCII characters via Three.js. It sets the aesthetic immediately — this isn't another boring SaaS tool.

**Why ember orange?**  
It's energetic without being aggressive. Against pure black, it pops without ever feeling like an error state.

---

## 🚀 Running Locally

```bash
git clone https://github.com/EVERYDAY-ARADHY/ZwoopMail
cd ZwoopMail
npm install
cp .env.example .env   # add your Google Client ID + Azure key
npm run dev            # → http://localhost:5173
```

> **Demo mode**: runs without any API keys — loads mock emails to explore the UI.

---

## 👾 Credits

Built by **Aradhy** for Overclock Delhi '26  
Forked from the chaos of legacy webmail.
