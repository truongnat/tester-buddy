# TesterBuddy

Monorepo for a browser recording/debugging tool — Electron desktop app + Chrome extension that captures browser events (click, input, navigation, console, network, tab lifecycle) and records video.

## Tech Stack

- **Monorepo**: pnpm workspaces
- **Apps**: Electron desktop (`apps/desktop`) + Chrome extension (`apps/extension`)
- **Language**: TypeScript (strict, ES2022, ESNext modules)
- **Rendering**: React 18 + Tailwind CSS + shadcn/ui (desktop renderer)
- **Validation**: Zod as single source of truth — `z.infer` for TS types
- **Build**: electron-vite (desktop), Vite (extension)
- **Database**: sql.js (SQLite via WASM in main process)

## Project Structure

```
packages/
  protocol/       # Shared types, Zod schemas, bridge config (BRIDGE_PORT, BRIDGE_HOST, IPC channels)
  shared/         # Shared utilities (cleanName, safeSend)
apps/
  desktop/        # Electron app
    src/main/     # Main process (bridge server, IPC handlers, ffmpeg, DB)
    src/preload/  # Context bridge (createListener helper for ipcRenderer)
    src/renderer/ # React UI (screens, components)
  extension/      # Chrome extension
    src/service-worker/
    src/content/
    src/injected/ # fetch/XHR hook + console hook
    src/popup/    # Pairing token UI
    src/offscreen/ # Video recording
    src/picker/   # Screen picker
```

## Commands

- `pnpm dev:desktop` — Start Electron in dev mode
- `pnpm dev:extension` — Watch-build extension
- `pnpm build` — Build all packages
- `pnpm typecheck` — Run `tsc --noEmit` across all packages
- `pnpm test` — (not yet configured)

## Code Style Rules

### TypeScript
- Strict mode, ES2022 target, ESNext modules
- **No `any`** — use Zod `z.infer`, discriminated unions, or proper type narrowing
- **No inline `require()`** — top-level ESM `import` only
- **No `as any` casts** — prefer type guards, discriminated unions, or proper public API methods
- **Immutability** — use spread `{...obj}` over mutation
- Early returns over deep nesting

### Naming
- **Files**: PascalCase for components (`Button.tsx`), camelCase for utilities (`formatDate.ts`)
- **Types**: PascalCase (`BrowserEvent`, `ExtensionSession`)
- **Functions**: camelCase, verb-prefixed (`getAllSessions`, `convertToMp4`)
- **Constants**: UPPER_SNAKE_CASE (`BRIDGE_PORT`, `RECONNECT_DELAY_MS`)

### Architecture
- **Zod is source of truth** — schemas in `protocol/src/schemas.ts`, types derived via `z.infer` in `messages.ts`
- **Bridge config centralized** — host/port/URLs in `protocol/src/channels.ts`, import everywhere
- **Shared utilities** in `packages/shared/src/utils/index.ts` — `cleanName`, `safeSend`
- **IPC channels** as const object in `desktop/src/main/ipc/channels.ts`
- **Preload bridge** uses `createListener<T>` generic helper — no duplicated `ipcRenderer.on` patterns

### Extension Patterns
- Use `safeSend(() => chrome.runtime.sendMessage(...))` instead of `.catch(() => {})`
- DRY navigation events: use `sendNavigation()` method instead of copy-paste blocks

### Dependencies
- Protocol is the only shared library across apps
- Shared package depends on protocol
- Desktop depends on both protocol + shared
- Extension depends on both protocol + shared

## Gotchas
- `Electron.Renderer` uses React UMD global — some files need `import React from "react"` for typecheck
- `sql.js` has no types — add `@types/sql.js` or declare module
- `BrowserEvent` is a Zod discriminated union — narrow with `if (event.type === "...")` checks, not `as any`
- `crypto.randomUUID()` for IDs — not `Math.random().toString(36)`
