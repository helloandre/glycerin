# Glycerin Codebase Cleanup Plan

## Overview

Clean up the Glycerin codebase after its migration from neo-blessed (JS) to Ink + TypeScript. The goals are:

1. Remove all unused legacy code
2. Fix all TypeScript issues
3. Fix all biome lint/format warnings
4. Ensure best practices throughout
5. Tighten tsconfig for better type safety
6. Clean up unused dependencies

---

## Phase 1: Delete Unused Files

All legacy neo-blessed JS files are unused by the new TypeScript codebase. No TS file imports from any of these.

### Files to delete:

**Root-level legacy files:**
- `index.js` — old CJS entry point (replaced by `src/index.ts`)
- `constants.js` — old CJS constants (functionality moved to vendor lib)

**Legacy screens (src/screens/*.js):**
- `src/screens/chats.js`
- `src/screens/threads.js`
- `src/screens/messages.js`
- `src/screens/input.js`
- `src/screens/search.js`
- `src/screens/confirm.js`
- `src/screens/working.js`
- `src/screens/prune.js`
- `src/screen.js` — old blessed screen bootstrap

**Legacy API layer (src/lib/api/*.js):**
- `src/lib/api/auth.js`
- `src/lib/api/create-thread.js`
- `src/lib/api/events.js`
- `src/lib/api/get-available-rooms.js`
- `src/lib/api/get-chat-messages.js`
- `src/lib/api/get-chat-threads.js`
- `src/lib/api/get-chats.js`
- `src/lib/api/get-space-details.js`
- `src/lib/api/get-thread-messages.js`
- `src/lib/api/get-users.js`
- `src/lib/api/hide-chat.js`
- `src/lib/api/mark-read.js`
- `src/lib/api/parse.js`
- `src/lib/api/request-batch.js`
- `src/lib/api/request.js`
- `src/lib/api/send-chat-message.js`
- `src/lib/api/send-thread-message.js`
- `src/lib/api/set-room-membership.js`
- `src/lib/api/unpack.js`
- `src/lib/api/whoami.js`

**Legacy models (src/lib/model/*.js):**
- `src/lib/model/chat.js`
- `src/lib/model/user.js`

**Legacy utilities:**
- `src/lib/eventemitter.js`
- `src/lib/state.js`
- `src/lib/config.js`
- `src/lib/format.js`
- `src/lib/timestamp.js`
- `src/lib/random-id.js`

**Broken/obsolete scripts:**
- `scripts/test-profile-detection.js` — imports from non-existent path
- `scripts/list-profiles.js` — imports from non-existent path
- Remove `scripts/` directory entirely

**Test/example files:**
- `src/test-poc.ts` — one-off POC test
- `example-browser-login.ts` — example file at root

---

## Phase 2: Fix TypeScript Issues

### 2.1 `src/lib/auth.ts`

| Line | Issue | Fix |
|------|-------|-----|
| 13 | `getProfile` imported but never used | Remove from import |
| 251 | `const fs = require('node:fs')` inside `clearAuth()` | `fs` is already imported at top of file — remove the redundant `require` |
| 70, 225, 260 | `error.message` on `unknown` type (3 locations) | Type-narrow: `error instanceof Error ? error.message : String(error)` |

### 2.2 `src/lib/chat-client.ts`

| Line | Issue | Fix |
|------|-------|-----|
| 194 | `leaveSpace` param `spaceId` unused | Prefix with `_spaceId` |

### 2.3 `src/lib/logger.ts`

| Line | Issue | Fix |
|------|-------|-----|
| 12 | `import fs from 'fs'` | Change to `import fs from 'node:fs'` |
| 13 | `import { homedir } from 'os'` | Change to `import { homedir } from 'node:os'` |
| 14 | `import path from 'path'` | Change to `import path from 'node:path'` |
| 24 | `catch (error)` — `error` unused | Change to `catch` |
| 92 | String concatenation | Change to template literal |
| 98 | `catch (error)` — `error` unused | Change to `catch` |

### 2.4 `src/index.ts`

| Line | Issue | Fix |
|------|-------|-----|
| 64 | `error.message` on `unknown` type | Type-narrow the error |

### 2.5 `src/components/App.tsx`

| Line | Issue | Fix |
|------|-------|-----|
| 237 | `!state.loading` — `loading` is `Record<string, boolean>`, never falsy | Change to `Object.keys(state.loading).length === 0` |

### 2.6 `src/components/ChatsPanel.tsx`

| Line | Issue | Fix |
|------|-------|-----|
| 18 | `ChatDisplayMode` imported but unused | Remove from import |
| 22-25 | `ChatSection` interface unused | Remove |
| 164 | `useEffect` missing `mode` in dependency array | Add `mode` to deps |
| 181 | `useEffect` deps include `displayItems` (new array every render) | Memoize `displayItems` with `useMemo` |
| 210 | `useEffect` deps include `displayItems` and `selectedIndex` | Use memoized version |
| 500 | `_isCurrent` variable defined but unused | Remove entirely |

### 2.7 `src/components/ThreadsPanel.tsx`

| Line | Issue | Fix |
|------|-------|-----|
| 27 | `client` prop received but never used | Remove `client` from props and `ThreadsPanelProps` interface |
| 66 | `useEffect` deps include `reversedThreads` (new array every render) | Memoize with `useMemo` |
| 69 | `useEffect` missing `viewportHeight` in dependency array | Add to deps |
| 155 | `_isCurrent` unused variable | Remove |

### 2.8 `src/components/InputBox.tsx`

| Line | Issue | Fix |
|------|-------|-----|
| 32 | `input` parameter in `useInput` callback unused | Prefix with `_input` |

### 2.9 `src/context/AppContext.tsx`

| Line | Issue | Fix |
|------|-------|-----|
| 244-254 | `MARK_READ` mutates state objects directly (`chat.isUnread = false`) | Create new objects immutably |
| 324 | `focused: state.active.chat ? 'chats' : 'chats'` — always returns same value | Simplify to `focused: 'chats'` |

---

## Phase 3: Fix Biome Lint/Format Issues (src/ only)

### 3.1 Update biome.json

Remove exclusions for deleted directories/files:
- `!**/src/lib/api`
- `!**/src/lib/model`
- `!**/src/screens`
- `!**/src/lib/eventemitter.js`
- `!**/index.js`

Add exclusion for vendor code:
- `!**/vendor`

### 3.2 Auto-fixable issues

Run `npx biome check --write .` to auto-fix:
- Import organization
- `useNodejsImportProtocol` (use `node:` prefix)
- `useConst` where `let` should be `const`
- Remove unused imports
- Template literal style fixes

---

## Phase 4: Dependency Cleanup

### 4.1 Remove unused dependencies from package.json

**dependencies to remove:**
- `@mherod/get-cookie` — was used by old auth.js
- `axios` — was used by old API layer
- `chalk` — was used by old format.js
- `lodash.get` — was used by old config.js
- `lodash.set` — was used by old config.js
- `moment` — was used by old format.js and timestamp.js
- `node-fetch` — was used by old API layer
- `qs` — was used by old API layer

**devDependencies to remove:**
- `@types/lodash.get` — corresponding dep removed
- `@types/lodash.set` — corresponding dep removed

**devDependencies to evaluate:**
- `@testing-library/react`, `ink-testing-library`, `@types/jest`, `jest`, `ts-jest` — no tests exist yet; keep if tests are planned
- `ts-node` — keep for `npm run dev` script

---

## Phase 5: Configuration Cleanup

### 5.1 tsconfig.json

Tighten TypeScript strictness now that legacy JS is removed:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

Note: Enabling strict mode will surface additional type errors. Do this last.

### 5.2 Clean up package.json scripts

Remove scripts that reference deleted code:
- `"ev"` — references old `-e` flag
- `"de"` — references old `-e` flag  
- `"leave"` — references old code

---

## Phase 6: Code Quality Improvements

### 6.1 Fix state mutation in AppContext reducer

The `MARK_READ` case mutates state directly. Fix to create new objects immutably.

### 6.2 Stabilize useEffect dependencies

Wrap inline arrays with `useMemo`:

**ChatsPanel.tsx:** Memoize `displayItems`
**ThreadsPanel.tsx:** Memoize `reversedThreads`

### 6.3 Remove unused `client` prop from ThreadsPanel

Update interface, props, and call site in `App.tsx`.

---

## Execution Order

1. **Phase 1** — Delete all unused files
2. **Phase 4** — Remove unused dependencies, run `npm install`
3. **Phase 3.1** — Update biome.json exclusions
4. **Phase 2** — Fix all TypeScript issues in src/
5. **Phase 6** — Code quality improvements (state mutation, useMemo, prop cleanup)
6. **Phase 3.2** — Run `npx biome check --write .` for auto-fixes
7. **Phase 5** — Tighten tsconfig, clean up scripts
8. **Verify** — Run `npx tsc --noEmit` and `npx biome check .` to confirm clean build

---

## Files After Cleanup

```
glycerin/
├── package.json
├── tsconfig.json
├── biome.json
├── .gitignore
├── LICENSE
├── README.md
├── TROUBLESHOOTING.md
│
├── src/
│   ├── index.ts
│   ├── types/
│   │   └── index.ts
│   ├── lib/
│   │   ├── auth.ts
│   │   ├── chat-client.ts
│   │   └── logger.ts
│   ├── context/
│   │   └── AppContext.tsx
│   ├── hooks/
│   │   ├── useFocus.ts
│   │   └── useKeyHandler.ts
│   └── components/
│       ├── App.tsx
│       ├── EventBridge.tsx
│       ├── ChatsPanel.tsx
│       ├── ThreadsPanel.tsx
│       ├── MessagesPanel.tsx
│       ├── InputBox.tsx
│       ├── ConfirmationModal.tsx
│       └── LoadingIndicator.tsx
│
├── vendor/
│   └── google-chat-api/  (untouched)
│
└── dist/  (build output, gitignored)
```
