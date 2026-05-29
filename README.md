# Reddit Daily Upvoter

Chrome extension (Manifest V3) that automatically upvotes the first post of a target subreddit once per day at a configured time. No Reddit API keys or OAuth required — operates as the logged-in user via normal browser session.

## How It Works

1. A `chrome.alarms` alarm fires once daily at your configured time.
2. The background service worker opens a background tab to `reddit.com/r/{subreddit}/top/?t=day`.
3. A content script waits for Reddit's JS-rendered feed to load, skips stickied/pinned posts, finds the first real post, and clicks the upvote button.
4. Result is logged to `chrome.storage.local`. Tab closes automatically (configurable).
5. If the primary subreddit fails (empty, private, banned, or times out), the extension retries with a fallback subreddit.

**Upvote detection strategy** (tried in order):
- `<button>` with `aria-label` containing `"upvote"` — standard new Reddit
- Shadow DOM inside `<shreddit-post>` web components — new Reddit web components
- `.arrow.up` buttons — legacy Reddit layout

Already-upvoted detection: `aria-pressed="true"` / `aria-label` contains `"unvote"` (new Reddit), or `.arrow.up.upmod` (legacy).

## Requirements

- Chrome with Developer Mode enabled
- Node.js ≥ 22
- pnpm

## Installation

```bash
# Install dependencies
pnpm install --ignore-scripts

# Build the extension
pnpm build

# Copy public assets into dist/
pnpm package
```

Then load unpacked in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `dist/` folder

## Configuration

### Via Options Page (recommended)

Right-click the extension icon → **Options**, or go to `chrome://extensions` → Details → Extension options.

| Setting | Default | Description |
|---|---|---|
| Primary Subreddit | `mtgporn` | Subreddit to upvote first |
| Fallback Subreddit | `crtgaming` | Used if primary fails |
| Daily Time | `09:00` | Local time to trigger (24h) |
| Auto-close tab | `true` | Close tab after upvote completes |

Changes take effect immediately; alarm re-registers with the new time.

### Via Source (`src/config.ts`)

Edit constants before building:

```ts
export const PRIMARY_SUBREDDIT = 'mtgporn';
export const FALLBACK_SUBREDDIT = 'crtgaming';
export const TRIGGER_HOUR = 9;
export const TRIGGER_MINUTE = 0;
export const AUTO_CLOSE_TAB = true;
```

Then rebuild with `pnpm build`.

## Usage

### Automatic

Extension runs once per day at the configured time. Browser must be open at trigger time — if it's closed, the alarm fires on next browser launch (same-day only; skips if day already passed).

### Manual Trigger

Click the extension toolbar icon → **Trigger Now**. Runs the full upvote flow immediately without resetting the daily alarm.

### Popup

The toolbar popup shows:
- Next scheduled run time
- Last run result (subreddit used, success / already upvoted / failed)
- Manual trigger button
- Link to Options

### Logs

Last 30 runs stored in `chrome.storage.local`. View via the popup or inspect directly:

```js
// In DevTools console on any page
chrome.storage.local.get('log', console.log);
```

Log entry shape:

```json
{
  "date": "2026-05-29",
  "timestamp": 1748476800000,
  "subreddit": "mtgporn",
  "usedFallback": false,
  "fallbackReason": null,
  "result": "success",
  "postTitle": "Post title here",
  "error": null
}
```

`result` values: `success` · `already_upvoted` · `failed` · `no_posts`

## Development

```bash
pnpm watch       # rebuild on file changes
pnpm typecheck   # TypeScript type check
pnpm lint        # ESLint
pnpm lint:fix    # ESLint with auto-fix
pnpm format      # Prettier format
pnpm format:check
```

Source lives in `src/`. Built output goes to `dist/`. After changes, reload the extension at `chrome://extensions` (click the refresh icon on the extension card).

## Project Structure

```
src/
├── background.ts   # Service worker: alarm scheduling, tab control, message routing
├── content.ts      # Injected into Reddit tabs: DOM upvote logic
├── options.ts      # Options page logic
├── popup.ts        # Toolbar popup logic
├── storage.ts      # chrome.storage read/write helpers
├── config.ts       # Default configuration constants
└── types.ts        # Shared TypeScript types
public/
├── manifest.json
├── options.html
├── popup.html
└── icons/
```

---

Cutting back on social media, but gotta keep the streak alive somehow...
