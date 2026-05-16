# LOCKBOX Browser Bridge Protocol

**Version:** 1.0.0  
**Port:** `ws://localhost:3002`  
**Transport:** WebSocket, JSON lines

This document defines the message protocol between the LOCKBOX Electron app and a companion browser extension (Manifest V3). The bridge enables the AI agent to observe browser context and perform actions in the active tab.

---

## Overview

```
┌──────────────────┐         WebSocket          ┌──────────────────┐
│   LOCKBOX App    │ ◄──────────────────────►   │ Browser Extension│
│  (Electron Main) │       ws://localhost:3002   │  (Manifest V3)   │
│                  │                             │                  │
│  - WebSocket     │   BROWSER_CONTEXT  ◄───────│  - Send tab info │
│    Server (ws)   │   PING / PONG      ◄───────│  - Keepalive     │
│  - IPC bridge to │                             │                  │
│    renderer      │   BROWSER_ACTION  ────────►│  - Execute click │
│                  │   REQUEST_CONTEXT ────────►│  - Execute type  │
└──────────────────┘                             │  - Scroll/Scrape │
                                                 └──────────────────┘
```

---

## Connection

1. The LOCKBOX Electron app starts a WebSocket server on `ws://localhost:3002` when the app launches.
2. The browser extension connects to `ws://localhost:3002`.
3. On connection, the extension sends a `PING` message. The app responds with `PONG`.
4. The app tracks connected clients. The renderer polls `browserAPI.getStatus()` every 10 seconds.
5. If the connection drops, the extension should auto-reconnect with exponential backoff.

---

## Message Types

### From Browser Extension → LOCKBOX

#### `BROWSER_CONTEXT`

Sent periodically (e.g., on tab switch, URL change, or user selection) to inform LOCKBOX of the active tab's state.

```json
{
  "type": "BROWSER_CONTEXT",
  "tabId": "12345",
  "url": "https://github.com/example/repo",
  "title": "example/repo: main repository",
  "origin": "https://github.com",
  "timestamp": 1715123456789,
  "summary": "A GitHub repository page showing the main branch",
  "selectionText": "function handleClick() {"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `string` | ✓ | `"BROWSER_CONTEXT"` |
| `tabId` | `string` | ✓ | Unique tab identifier |
| `url` | `string` | ✓ | Full URL of the active tab |
| `title` | `string` | ✓ | Page title |
| `origin` | `string` | ✓ | Origin (protocol + hostname) |
| `timestamp` | `number` | ✓ | Unix timestamp in milliseconds |
| `summary` | `string` | | Optional AI-generated or meta-description of the page |
| `selectionText` | `string` | | Currently selected text on the page (if any) |

The app stores the **last received** `BROWSER_CONTEXT` in memory. Only the most recent is kept. It can be retrieved via `browserAPI.getLastContext()`.

#### `PING`

Sent on connect and periodically to keep the connection alive.

```json
{
  "type": "PING",
  "source": "extension",
  "timestamp": 1715123456789
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `string` | ✓ | `"PING"` |
| `source` | `string` | ✓ | `"extension"` |
| `timestamp` | `number` | ✓ | Unix timestamp in milliseconds |

---

### From LOCKBOX → Browser Extension

#### `BROWSER_ACTION`

Sent by the LOCKBOX AI agent when it decides to interact with the browser page. The extension receives this and executes the action in the active tab.

```json
{
  "type": "BROWSER_ACTION",
  "actionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "action": "click",
  "selector": "#submit-button",
  "text": null,
  "scrollY": null,
  "url": null
}
```

```json
{
  "type": "BROWSER_ACTION",
  "actionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "action": "type",
  "selector": "#search-input",
  "text": "hello world",
  "scrollY": null,
  "url": null
}
```

```json
{
  "type": "BROWSER_ACTION",
  "actionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "action": "navigate",
  "selector": null,
  "text": null,
  "scrollY": null,
  "url": "https://example.com/new-page"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `string` | ✓ | `"BROWSER_ACTION"` |
| `actionId` | `string` | ✓ | UUID v4 for correlating results |
| `action` | `string` | ✓ | One of: `"click"`, `"type"`, `"scroll"`, `"navigate"`, `"scrape"` |
| `selector` | `string` | | CSS selector for `click`, `type`, `scroll` actions |
| `text` | `string` | | Text to type (for `type` action) |
| `scrollY` | `number` | | Pixel position to scroll to (for `scroll` action) |
| `url` | `string` | | Target URL (for `navigate` action) |

**Action semantics:**

| Action | Required Fields | Behavior |
|--------|----------------|----------|
| `click` | `selector` | Click the element matching the CSS selector |
| `type` | `selector`, `text` | Focus the element and type the text |
| `scroll` | `selector` or `scrollY` | Scroll element into view, or to a specific Y position |
| `navigate` | `url` | Navigate the active tab to the URL |
| `scrape` | `selector` (optional) | Extract page content; if selector provided, extract matching element text |

#### `REQUEST_CONTEXT`

Requests the extension to send the current tab context immediately.

```json
{
  "type": "REQUEST_CONTEXT",
  "requestId": "b2c3d4e5-f6a7-8901-bcde-f12345678901"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `string` | ✓ | `"REQUEST_CONTEXT"` |
| `requestId` | `string` | ✓ | UUID v4 for correlating the response |

The extension should respond by sending a `BROWSER_CONTEXT` message with the current active tab's information.

#### `PONG`

Response to a `PING` from the extension.

```json
{
  "type": "PONG",
  "source": "app",
  "timestamp": 1715123456789
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `string` | ✓ | `"PONG"` |
| `source` | `string` | ✓ | `"app"` |
| `timestamp` | `number` | ✓ | Unix timestamp in milliseconds |

---

## Browser Extension Implementation Guide (Future)

When building the Manifest V3 extension, follow these guidelines:

### `manifest.json` Permissions

```json
{
  "manifest_version": 3,
  "name": "LOCKBOX Bridge",
  "version": "1.0.0",
  "permissions": [
    "activeTab",
    "tabs",
    "scripting",
    "storage"
  ],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_title": "LOCKBOX Bridge"
  }
}
```

### Background Script Behavior

1. **Connect** to `ws://localhost:3002` on service worker startup.
2. **Auto-reconnect** with exponential backoff (1s, 2s, 4s, 8s, max 30s) on disconnect.
3. **Send `PING`** every 30 seconds to keep the connection alive.
4. **Monitor tabs** using `chrome.tabs.onActivated`, `chrome.tabs.onUpdated`, and `chrome.tabs.onHighlighted`.
5. **Send `BROWSER_CONTEXT`** on tab changes, including the page title, URL, and any `meta` description.
6. **Listen for `BROWSER_ACTION`** and execute the action using `chrome.scripting.executeScript` or `chrome.tabs.update`.
7. **Listen for `REQUEST_CONTEXT`** and respond with a fresh `BROWSER_CONTEXT`.
8. **Send `BROWSER_ACTION_RESULT`** back to the app after executing an action (future protocol extension).

### Security Notes

- The WebSocket server listens only on `localhost:3002` — no external connections.
- The extension should validate that the WebSocket handshake origin is `https://localhost` or `http://localhost`.
- No authentication is needed since both processes run on the same machine.

---

## TypeScript Types Reference

```typescript
// Messages from browser extension → LOCKBOX
type BrowserToAppMessage =
  | {
      type: 'BROWSER_CONTEXT'
      tabId: string
      url: string
      title: string
      origin: string
      timestamp: number
      summary?: string
      selectionText?: string
    }
  | {
      type: 'BROWSER_ACTION_RESULT'
      actionId: string
      success: boolean
      message?: string
      data?: any
    }
  | {
      type: 'PING'
      source: 'extension'
      timestamp: number
    }

// Messages from LOCKBOX → browser extension
type AppToBrowserMessage =
  | {
      type: 'BROWSER_ACTION'
      actionId: string
      action: 'click' | 'type' | 'scroll' | 'navigate' | 'scrape'
      selector?: string
      text?: string
      scrollY?: number
      url?: string
    }
  | {
      type: 'REQUEST_CONTEXT'
      requestId: string
    }
  | {
      type: 'PONG'
      source: 'app'
      timestamp: number
    }
```

---

## IPC API (for Renderer)

The renderer accesses the bridge through these IPC methods exposed on `window.browserAPI`:

| Method | IPC Channel | Returns | Description |
|--------|-------------|---------|-------------|
| `getStatus()` | `browser:get-status` | `{ connected: boolean, clients: number }` | Whether any extension is connected |
| `sendAction(msg)` | `browser:send-action` | `{ forwarded: number }` | Forward a `BROWSER_ACTION` to all connected extensions |
| `getLastContext()` | `browser:get-last-context` | `BROWSER_CONTEXT \| null` | The most recent browser context payload |

---

## Future Protocol Extensions

- `BROWSER_ACTION_RESULT` — extension reports back success/failure of an action, including any scraped data
- `REQUEST_CONTEXT` — app can request a fresh context snapshot on demand
- `TAB_LIST` — extension sends a list of all open tabs
- `SCREENSHOT` — extension captures a screenshot of the active tab
