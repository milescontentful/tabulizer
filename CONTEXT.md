# Tabulizer - Project Context

This document provides context for returning to this project after a break.

**Last Updated:** July 14, 2026 (evening — App Functions added)

## Key IDs

| Thing | ID |
|---|---|
| Org | `0EJtkVUGWJCta9Kk8Q3ZCB` |
| App definition | `22ZgfSfvKkFg2w0dqupXhQ` |
| App Action: List AI Actions | `34PhrpWXe5vNmptu6tIErP` |
| App Action: Translate Fields | `ch8JlwGk5hZbFWNNvvTB8` |
| Install link | https://app.contentful.com/deeplink?link=apps&id=22ZgfSfvKkFg2w0dqupXhQ |

App Action IDs are baked into `src/utils/appActions.ts` and `contentful-app-manifest.json` — they live on the app definition, so they're stable across all installs.

## Project Status: Production Ready ✓

Tabulizer is a fully-featured Contentful Entry Editor app with:
- Multiple layout modes (Tabs, Columns)
- Multiple display modes (Compact, Verbose, Translation)
- Full locale/translation support
- AI Actions integration (hybrid workflow)
- Production build ready for deployment

## What's Working

### 1. Layout Modes
| Mode | Description |
|------|-------------|
| **Tabs** | Browser-like tabs for organizing fields |
| **Columns** | Side-by-side columns for parallel editing |
| **In-editor toggle** | Switch layouts without leaving the editor |

### 2. Display Modes
| Mode | Description |
|------|-------------|
| **Compact** | Minimal spacing, dense information display |
| **Verbose** | Field descriptions, validation messages, type info |
| **Translation** | Side-by-side locale columns with progress tracking |

### 3. Translation Features
- Side-by-side locale comparison (equal-width columns)
- Live translation progress bar per locale (Symbol, Text, AND Rich Text; updates via field subscriptions, no polling)
- Per-field "copy from source" button on every target-locale cell
- Bulk actions: Copy All, Clear All (both with confirmation modal), Prepare for AI
- Works with any AI Actions configured in the space
- Content Model order (ignores tab/column configuration)

### 4. Field Editing
- Full field editor support for all types
- Asset cards with thumbnails and actions
- Entry reference cards
- Tags with drag-and-drop reordering
- Boolean, Date, Number, Location, etc.

### 5. App Configuration
- Per-content-type settings
- Drag-and-drop field assignment
- Tab management (add, remove, rename, reorder)
- Column management (add, remove, rename)
- Layout type selection (tabs vs columns)

## Key Files

| File | Purpose |
|------|---------|
| `src/locations/EntryEditor.tsx` | Main editor: toolbar, tabs/columns layouts, display mode routing |
| `src/components/TranslationView.tsx` | Translation mode: side-by-side locales, progress, bulk + per-field actions |
| `src/locations/ConfigScreen.tsx` | App configuration UI |
| `src/components/FieldRenderer.tsx` | Field rendering with full editor support |
| `src/hooks/useTabConfig.ts` | Configuration reader hook |
| `src/types/index.ts` | TypeScript interfaces |
| `vercel.json` | Deployment configuration for Vercel (alternative to Contentful hosting) |

## Architecture

### Display Mode Flow
```
EntryEditor
├── displayMode: 'compact' | 'verbose' | 'translation'
├── activeLayout: 'tabs' | 'columns'
│
├── Translation Mode → TranslationView component
│   ├── Shows ALL localized fields (Content Model order)
│   ├── Progress bar per locale
│   └── Bulk actions (Copy, Clear, Prepare for AI)
│
└── Tabs/Columns Mode → TabPanel or Column components
    └── FieldRenderer for each field
```

### Locale Handling
```typescript
// Subscribe to sidebar locale changes
sdk.editor.onLocaleSettingsChanged((settings) => {
  setLocaleSettings(settings);
});

// Get active locales (supports multiple)
const activeLocales = localeSettings.active?.length > 0 
  ? localeSettings.active 
  : [sdk.locales.default];
```

### AI Translation (Hybrid Workflow)
Since direct AI Action invocation isn't possible from iframe:
1. "Prepare All for AI Translation" copies source content to target
2. User clicks native ✨ AI button (top-right of Contentful)
3. Selects "Translate" AI Action
4. AI translates using the space's configured AI Actions

## Configuration Storage

Stored in Contentful installation parameters:

```typescript
{
  tabConfig: {
    "contentTypeId": {
      enabled: true,
      layoutType: 'tabs' | 'columns',
      tabs: [
        { id: "tab_xxx", name: "Basic Info", fieldIds: ["title", "slug"], order: 0 }
      ],
      columns: [
        { id: "col_xxx", label: "Main", fieldIds: ["title", "description"] }
      ]
    }
  }
}
```

## Deployment

### Production Build
```bash
npm run build    # Output in /build folder
```

### Vercel (Recommended)
```bash
vercel           # Deploy with CLI
# Or connect GitHub repo for auto-deploy
```

### After Deployment
1. Update app definition URL in Contentful
2. Share with colleagues - they install in their spaces
3. Each space has independent configuration

## Testing

```bash
npm run dev      # Start at localhost:3000
```

Test in Contentful:
1. Open entry with Tabulizer enabled
2. Test display modes: Compact → Verbose → Translation
3. Test layout toggle: Tabs ↔ Columns
4. Enable multiple locales and test Translation mode
5. Test bulk actions in Translation mode

## Spaces Used for Testing

| Space | ID | Notes |
|-------|-----|-------|
| xbone | `b6m8zzfar718` | Primary test space |
| What We Heard | `6drgipdzi12g` | Secondary test space |

## Session History

### July 14, 2026 (Latest, night) — Translation UX overhaul
- Fixed the Rich Text white-screen crash: pseudo-SDK now sanitizes BOTH getValue and onValueChanged paths; RichTextEditor wrapped in an error boundary that falls back to a read-only preview
- Translation mode: "Translate into" target-locale picker — source + one target by default, "All active locales" optional; tab bar and layout toggle hidden in translation mode
- Row-header layout: field name/type/required as a slim line above each row (removed the cramped 140px left column)
- `translateFields` function reworked to per-field calls: frontend fires all fields in parallel, results stream into the UI, button shows "Translating 3/6…"
- Rich Text AI translation: function batch-translates text node values (delimiter-joined) and re-injects them, preserving document structure — verified via CMA (en→ja on the offer entry)
- Removed the legacy "Prepare All for AI Translation" menu item (redundant with direct AI translate)

### July 14, 2026 (evening) — App Functions + One-Click AI Translation
- Added two App Functions (pattern ported from content-health-dashboard): `listAiActions` and `translateFields` in `functions/`, built with `contentful-app-scripts build-functions`
- Functions run server-side with App Identity (`context.cma`) — this bypasses the iframe restriction on invoking AI Actions
- `translateFields` RETURNS translations instead of writing via CMA (avoids version conflicts with the open editor); the frontend applies them via the App SDK field API so UI/progress/autosave stay in sync
- Created App Actions via CMA (upsert-actions CLI has no --ci mode; POST to `/organizations/{org}/app_definitions/{def}/actions` with `function` link works — payload shape from app-scripts `make-cma-payload.js`)
- Created an App Identity key (required for `context.cma` in functions; none existed)
- Translation mode Actions menu now shows a "Translate with AI" section listing the space's published AI Actions
- Smoke-tested end-to-end via CMA in Xbone3 space: `listAiActions` returned the 3 published AI Actions ✓
- App action call response body lives at `.../calls/{callId}/response` (the `createWithResponse` SDK method handles this)
- Upgraded `@contentful/app-scripts` to v2, added `@contentful/node-apps-toolkit`
- Added install deeplink to README for sharing with colleagues

### July 14, 2026 — Cleanup & Polish
- Removed all leftover AI-agent debug instrumentation (localhost fetch calls + console logs) from `createFieldSDK.ts` and `FieldRenderer.tsx`
- Deleted dead code: `useTabConfigManager` hook, orphaned Dialog location, unused `FieldList` wrapper, unused type exports, components barrel file
- Extracted `TranslationView` from EntryEditor into `src/components/TranslationView.tsx` with a `useTranslationProgress` hook
- Progress bar now counts Symbol, Text, AND Rich Text fields, and updates live via `onValueChanged` subscriptions (replaced 3-second polling)
- Added F36 `ModalConfirm` for Clear All / Copy All (destructive actions)
- All bulk actions now show a loading state and per-field counts in success toasts
- Added per-field "copy from source" button in translation cells
- Removed redundant 2-second locale polling (kept subscription + manual refresh button)
- Removed the misleading "Column Layout Recommended" modal (translation view ignores column config)
- Replaced hardcoded hex colors with `@contentful/f36-tokens`; custom dropdown buttons with F36 `Button`; emoji chrome with F36 icons/badges
- Repo hygiene: deleted zips + `.cursor/debug.log`, extended `.gitignore`, added MIT LICENSE, initialized git, pushed to github.com/milescontentful/tabulizer
- Deployed to Contentful hosting (app definition `22ZgfSfvKkFg2w0dqupXhQ`)

### January 12, 2026
- Added Translation display mode with side-by-side locales
- Implemented translation progress bars
- Added bulk actions (Copy All, Clear All, Prepare for AI)
- Implemented hybrid AI workflow (uses native AI menu)
- Made locale columns equal width for line-by-line comparison
- Added refresh button for locale settings
- Fixed locale ordering (source always on left)
- Fixed Clear All - removed `window.confirm()` blocked by iframe sandbox
- Created vercel.json for deployment
- Created tabulizer-bundle.zip for Contentful hosting upload
- Documented iframe sandbox limitations
- Added Rich Text preview rendering using `@contentful/rich-text-react-renderer`
- Added "Edit in Editor" button for Rich Text fields
- Hide Translation mode when only one locale is available
- Auto-switch to Columns layout when entering Translation mode
- Added column suggestion modal when no columns configured
- Updated README and CONTEXT.md

### January 11, 2026
- Implemented full editor parity with native Entry Editor
- Added Compact/Verbose display modes
- Added Tabs/Columns layout toggle
- Implemented multi-locale stacked display
- Fixed field alignment and styling
- Added locale settings subscription

### Previous Sessions
- Built complete MVP with tab configuration
- Implemented drag-and-drop field assignment
- Created browser-like tab interface
- Added column layout option

## Important: Contentful Iframe Sandbox Limitations

Contentful apps run in a **sandboxed iframe** with restrictions:

| Blocked | Alternative |
|---------|-------------|
| `window.confirm()` | Remove confirmation or use SDK dialogs |
| `window.alert()` | Use `sdk.notifier.success/warning/error()` |
| `window.prompt()` | Use SDK dialogs or custom UI |
| Direct AI Action API calls | Use hybrid workflow with native AI menu |

**Example fix:**
```typescript
// ❌ Blocked - will silently fail
if (window.confirm('Are you sure?')) { ... }

// ✅ Works - Contentful's notification system
sdk.notifier.success('Action completed!');
```

## Commands

```bash
npm run dev      # Development server (localhost:3000)
npm run build    # Production build
npm run preview  # Preview production build
npm run upload   # Upload to Contentful hosting
vercel           # Deploy to Vercel
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `@contentful/f36-components` | Forma 36 UI components |
| `@contentful/f36-icons` | Icons |
| `@contentful/app-sdk` | Contentful App SDK |
| `@contentful/react-apps-toolkit` | React hooks |
| `@contentful/rich-text-react-renderer` | Rich Text preview rendering |
| `@contentful/rich-text-types` | Rich Text type definitions |
| `@dnd-kit/core` | Drag and drop |
| `@dnd-kit/sortable` | Sortable lists |
| `contentful-management` | CMA client |

## Future Enhancements

- [ ] **Full inline Rich Text editor** - Integrate `@contentful/field-editor-rich-text` with SDK bridging for full editing in Translation mode (currently uses read-only preview with "Edit in Editor" button)
- [ ] Keyboard shortcuts (Ctrl+S save, Tab navigation)
- [ ] Dark mode support
- [ ] Remember user preferences (localStorage)
- [ ] Field search/filter
- [ ] Entry compare/diff view
- [ ] Inline tab creation via Dialog
