# TesterBuddy — Analysis & Implementation Plan

> Authors: Kiro (AI), Truong (Product), ChatGPT 5.5 (Review)  
> Date: 2026-06-25  
> Status: Draft v0.1

---

## 1. Problem Statement

QA engineers testing internal tools (admin panels, staging environments, Jira-connected apps) have a critical limitation with automation tools like Playwright: **they cannot reuse the user's real browser session**. This means:

- Login flows must be re-executed every test run
- Session-specific state (cookies, local storage, auth tokens) is inaccessible
- Real-world bugs occur in the real session, not a clean Playwright context
- Evidence capture (screenshot + network + console) requires separate tooling

**TesterBuddy solves this** by living inside the user's actual browser via a Chrome extension, capturing real session evidence and sending it to a local Electron app for storage, analysis, and reporting.

---

## 2. Architecture Analysis

### 2.1 Strengths of Browser-Connected approach

| Concern              | Playwright approach      | Browser-Connected approach          |
| -------------------- | ------------------------ | ----------------------------------- |
| Auth/session         | Re-auth every run        | User's live session, already logged in |
| Internal tools       | VPN + custom auth needed | Works out of the box                |
| DOM fidelity         | Headless quirks          | Exactly what user sees              |
| Network capture      | Proxy required           | fetch/XHR hook in page context      |
| Console logs         | CDP log events           | console.error proxy in page context |
| Agent control        | CDP driver               | Content script DOM actions          |
| Distribution         | Node binary dependency   | Chrome extension install            |

### 2.2 Known Constraints (must design around)

1. **cross-origin iframes** — content script can only access same-origin frames. Solution: flag cross-origin iframe in DOM snapshot, skip or use `chrome.debugger` later.
2. **HttpOnly cookies** — never readable by JS. Solution: never try; document clearly that auth cookies are not captured.
3. **Service worker keepalive** — SW can be killed. Solution: WebSocket activity every 20s keeps SW alive (Chrome 116+). If killed, reconnect on next message.
4. **CSP on some sites** — `injected.js` injection may be blocked by strict CSP. Solution: graceful fallback — content script records DOM events without fetch hook.
5. **Shadow DOM** — `getSelector` must handle `shadowRoot` paths. Solution: defer to post-MVP.

---

## 3. Data Flow Analysis

```
User action in browser tab
  │
  ▼
Content Script (DOM event listener)
  │ postMessage / chrome.runtime.sendMessage
  ▼
Service Worker (router)
  │ WebSocket message
  ▼
Local Bridge 127.0.0.1:17393 (Node.js ws server in Electron main)
  │ ExtensionSessionRegistry.handleMessage
  ▼
Event Bus → Bug Service / Timeline Service / Capture Service
  │ IPC
  ▼
Renderer (Timeline view / Bug builder)
```

**Injected script path (page context):**
```
fetch/XHR call in page
  → patched window.fetch fires CustomEvent("__testerbuddy__")
  → content script window.addEventListener("__testerbuddy__")
  → relays via chrome.runtime.sendMessage to SW
  → SW relays to bridge WS
```

---

## 4. Implementation Plan

### Phase 0 — Foundation (current sprint)

**Goal:** Monorepo structure, buildable, no runtime yet.

| Task | Owner | Status |
| ---- | ----- | ------ |
| Monorepo init (pnpm workspaces) | Kiro | ✅ Done |
| `@testerbuddy/protocol` — types + Zod schemas | Kiro | ✅ Done |
| `@testerbuddy/shared` — types + utils | Kiro | ✅ Done |
| Desktop scaffold: bridge + main + preload | Kiro | ✅ Done |
| Extension scaffold: SW + content + injected | Kiro | ✅ Done |

### Phase 1 — Live Connection (MVP core)

**Goal:** Extension connects to desktop, events flow end-to-end.

| Task | Priority | Status | Notes |
| ---- | -------- | ------ | ----- |
| WS connection from extension SW to local bridge | P0 | ✅ Done | Needs token from storage |
| Pairing flow: desktop shows token, popup lets user paste | P0 | ✅ Done | Simple prompt UI first |
| Bridge validates token, registers session | P0 | ✅ Done | Already scaffolded |
| Content script relays click/input/navigation events | P0 | ✅ Done | EventRecorder → SW → WS |
| Injected script relays fetch/XHR + console.error | P0 | ✅ Done | CustomEvent bridge to content |
| Desktop receives and logs events in console | P0 | ✅ Done | No UI needed yet |


**Acceptance:** open app, install extension, paste token, click a button in browser → see event in desktop console.

### Phase 2 — Timeline & Screenshot

**Goal:** Desktop has live timeline view, screenshots linkable to events.

| Task | Priority | Status | Notes |
| ---- | -------- | ------ | ----- |
| SQLite schema: sessions, events, screenshots | P0 | ✅ Done | Using sql.js |
| Store incoming events in DB | P0 | ✅ Done | Timestamped and persisted to disk |
| Capture visible tab on demand (`chrome.tabs.captureVisibleTab`) | P0 | ✅ Done | Returns base64 PNG |
| Transfer screenshot blob → desktop via WS | P0 | ✅ Done | Base64 transferred in ws event |
| Store screenshot on disk, record fileId | P0 | ✅ Done | Saved to screenshots/ folder |
| Timeline IPC → renderer | P0 | ✅ Done | IPC channel and preload exposed |
| Renderer: basic timeline list with event types | P1 | ✅ Done | Render events list & display screenshots |

### Phase 3 — Bug Builder & Export

**Goal:** User can select a time range from timeline and export a bug report.

| Task | Priority | Notes |
| ---- | -------- | ----- |
| BugReport data model | P0 | |
| Select events from timeline → attach to bug | P0 | |
| Attach screenshots from session | P0 | |
| Markdown export | P0 | `## Steps to Reproduce`, screenshot links |
| HTML export with inline screenshots | P1 | |
| Jira export (REST API, user provides token) | P2 | |
| GitHub issue export | P2 | |

### Phase 4 — Agent Control

**Goal:** LLM-driven agent can send commands to real browser via extension.

| Task | Priority | Notes |
| ---- | -------- | ----- |
| `agent-command.service.ts` — take LLM tool output, map to BrowserCommand | P0 | |
| `browser-control.service.ts` — send command via WS to active tab | P0 | |
| Content script executes: click, type, scroll, read.dom | P0 | |
| DOM snapshot response | P1 | Returns simplified DOM tree |
| Highlight overlay | P1 | Show which element is targeted |
| Multi-step action sequences | P2 | |
| Self-healing selector fallback | P3 | |

---

## 5. Open Questions (needs team decision)

| # | Question | Options | Recommendation |
| - | -------- | ------- | -------------- |
| 1 | Renderer framework? | Vanilla TS / React / Svelte | React — team familiarity, good for complex state |
| 2 | SQLite migration tool? | Drizzle / Prisma / raw SQL | Drizzle ORM (lightweight, TS-first) |
| 3 | Screenshot transfer — base64 vs binary WS frame? | base64 (simpler) vs ArrayBuffer (efficient) | Base64 for MVP, switch to binary if >500KB images hurt |
| 4 | Extension side panel vs popup? | Popup only / Side panel first | Side panel better UX for recording status |
| 5 | Pairing token UX? | Prompt / QR code / auto-discovery | QR code long-term, prompt for MVP |
| 6 | Port conflict handling? | Fixed 17393 / configurable | Fixed for MVP, configurable setting later |
| 7 | `chrome.webRequest` permission? | Include in MVP / post-MVP | Post-MVP — requires "declarativeNetRequest" in MV3 review |

---

## 6. Risk Register

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| CSP blocks injected.js on some sites | Medium | Low | Graceful degradation: lose fetch hook, keep DOM events |
| SW killed mid-session | Medium | Medium | Auto-reconnect in ws-client.ts + keepalive ping |
| Large payloads over WS (big DOM snapshot) | Low | Medium | Paginate / throttle DOM reads |
| User accidently captures passwords | Low | High | input[type=password] always redacted (already implemented) |
| Chrome extension MV3 SW 30s limit | High | Medium | WS keepalive msg every 20s (Chrome 116+ fixed this) |
| cross-origin iframe blocking | High | Low (MVP) | Document clearly as known limitation |

---

## 7. Tech Stack Final Decisions

```
Monorepo:       pnpm workspaces
Desktop:        Electron 31 + electron-vite + TypeScript
Renderer:       TBD (React recommended)
Storage:        better-sqlite3 (SQLite)
Bridge:         Node.js http + ws (WebSocket)
Validation:     Zod
Extension:      Chrome MV3, Vite build
Protocol:       @testerbuddy/protocol (shared TS types + Zod)
Shared:         @testerbuddy/shared (domain types + utils)
Agent (future): Local LLM or OpenAI function calling
```

---

## 8. Next Immediate Steps

1. **Phase 1 & 2 Completed**: WS pairing, event relaying, SQLite DB persistence, tab title tracking, search, sort, and fullscreen screenshot zoom features are fully functional.
2. **Move to Phase 3 — Bug Builder & Export**:
   * Implement BugReport data models and persistence (SQLite table).
   * Implement selecting events from the timeline and attaching them to the Bug Report.
   * Attach screenshot attachments to the Bug Report.
   * Build export functionalities: Markdown export (`## Steps to Reproduce` + screenshots).

---

## 9. Questions for Team Review

**For Truong (Product):**
- Side panel or popup for extension UX?
- Do you need Jira export in MVP, or Phase 3+?
- Should bug reports include full network log or only errors?

**For ChatGPT 5.5 (Technical Review):**
- Is there a better selector strategy than `#id > [data-testid] > tag.class` for resilient DOM targeting?
- For the agent phase: should we serialize DOM as accessibility tree (AXTree) or simplified HTML? Tradeoffs?
- `chrome.debugger` API for network body capture — worth the permission complexity in MVP?


---

## 10. UI Design System — Precision Light

**Decision:** Use **Precision Light** theme throughout the desktop renderer.

### Theme Principles
- **Light, clean, high trust** — white surfaces, clear tables, minimal decoration
- **Teal accent** (`#0F9F8F`) for active/recording/export/primary actions
- **Red only for real errors** — API 500, console.error, failed checks
- **Dense-enough layout** — testers stare at timeline + bug form for hours
- **Desktop productivity feel** — not a SaaS landing page

### Palette

| Token         | Value     |
| ------------- | --------- |
| Background    | `#F5F7F8` |
| Surface       | `#FFFFFF` |
| Surface muted | `#EDF2F4` |
| Text          | `#182024` |
| Muted text    | `#687378` |
| Border        | `#D9E1E4` |
| Primary       | `#0F9F8F` |
| Error         | `#E5383B` |
| Success       | `#1F9D55` |
| Warning       | `#C27C0E` |

### Stack
- **Tailwind CSS 3** — token-mapped in `tailwind.config.js`
- **Radix UI primitives** — accessible headless components
- **class-variance-authority** — variant-based component API
- **lucide-react** — icon set
- **React 18 + react-router-dom** — renderer framework + routing

### Screens built (Phase 1 UI)
1. **Live Session Timeline** — event list with type icons + detail panel + record/capture buttons
2. **Bug Report Builder** — title, severity picker (4 levels), steps/expected/actual fields, screenshot attachments, export
3. **Project Workspace** — project list with search, stats (bugs/sessions/last active), recent bugs with severity badges

### Screen priority (post-MVP)
- Settings (pairing token display, port config)
- Test Case manager
- API log viewer
- Visual diff
