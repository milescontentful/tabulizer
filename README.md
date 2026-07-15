# Tabulizer

A powerful Contentful app that transforms the Entry Editor experience with configurable layouts, translation workflows, and a modern UI. Organize fields into tabs or columns, compare content across locales side-by-side, and streamline your editorial workflow.

## 🚀 Install

**[→ Install Tabulizer in your space](https://app.contentful.com/deeplink?link=apps&id=22ZgfSfvKkFg2w0dqupXhQ)**

Click the link, pick your space and environment, and authorize the app. Then open **Apps → Tabulizer** to configure which content types use it. (The app is private to the Contentful SE organization — you need to be a member to install it.)

## ✨ Features

### Layout Options
- **Tabs Layout**: Organize fields into named tabs for focused editing
- **Columns Layout**: Side-by-side columns for comparison and parallel editing
- **In-Editor Switching**: Toggle between Tabs and Columns without leaving the editor

### Display Modes
- **Compact**: Minimal spacing for dense information display
- **Verbose**: Expanded view with field descriptions and validation messages
- **Translation**: Side-by-side locale columns for translation workflows

### Translation Workflow
- **Side-by-Side Locales**: Source and target languages displayed in equal columns
- **Live Progress Tracking**: Progress bar per locale covering all translatable text fields (including Rich Text), updated in real time as you type
- **Per-Field Copy**: One-click "copy from source" button on every target-locale field
- **Bulk Actions**: Copy all content from source locale, clear all, or prepare for AI translation — destructive actions ask for confirmation first
- **One-Click AI Translation**: The Actions menu lists your space's published AI Actions and applies them to a whole locale column, server-side via App Functions — no leaving the editor

### Full Field Editor Support
- Rich Text, References, Media/Assets
- Tags with drag-and-drop reordering
- Boolean, Date, Number, Location
- All field types work natively

### Per-Content-Type Configuration
- Enable/disable Tabulizer per content type
- Different tab/column configurations for each content type
- Drag-and-drop field assignment

## Screenshots

### Translation Mode
```
┌──────────────┬─────────────────────────┬─────────────────────────┐
│ Field        │ English (US)  [Source]  │ Japanese (Japan)  100%  │
├──────────────┼─────────────────────────┼─────────────────────────┤
│ Title        │ Call of Duty: BO7       │ コール オブ デューティ     │
│ Description  │ Includes: Cross-Gen...  │ 含まれるもの:Call of...   │
└──────────────┴─────────────────────────┴─────────────────────────┘
```

## Installation

### Prerequisites
- Node.js 18 or higher
- A Contentful space with admin access

### Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   ```
   The app runs at `http://localhost:3000`

3. **Create an app definition in Contentful**:
   - Go to Organization Settings → Apps → Create app
   - **Name**: Tabulizer
   - **App URL**: `http://localhost:3000`
   - Enable locations: App configuration, Entry editor
   - Install in your space

4. **Configure the app**:
   - Go to Apps → Tabulizer in your space
   - Select a content type and enable Tabulizer
   - Create tabs/columns and assign fields
   - Save configuration

## Deployment

### Option 1: Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Build and deploy
npm run build
vercel
```

Or connect your GitHub repo to Vercel for automatic deployments.

### Option 2: Netlify

```bash
npm run build
# Deploy the /build folder to Netlify
```

### Option 3: Contentful Hosting

```bash
export CONTENTFUL_ORG_ID=your_org_id
export CONTENTFUL_APP_DEF_ID=your_app_def_id
export CONTENTFUL_ACCESS_TOKEN=your_management_token
npm run upload
```

### After Deployment

1. Update your app definition URL in Contentful to point to the production URL
2. Share with colleagues - they can install in their own spaces

## Usage Guide

### Display Mode Toggle
Click the dropdown in the header to switch between:
- **Compact**: Dense layout for quick scanning
- **Verbose**: Detailed view with descriptions
- **Translation**: Side-by-side locale comparison

### Layout Toggle
When both tabs and columns are configured:
- **Tabs**: Traditional tabbed interface
- **Columns**: Multi-column layout

### Translation Workflow
1. Enable multiple locales in Contentful's sidebar
2. Switch to **Translation** mode
3. View source and target locales side-by-side, with a live progress bar per target locale
4. Copy a single field from the source locale with the copy button next to each target field
5. Use **Actions** menu for bulk operations:
   - **Translate with AI → [your AI Action]**: One click translates every text field (including Rich Text) into the target locale, streaming results into the column as they finish
   - **Copy All from Source**: Duplicate source to target (asks for confirmation)
   - **Clear All**: Reset target locale content (asks for confirmation)

### AI Translation (App Functions + App Actions)

Contentful blocks AI Action invocation from app iframes, so Tabulizer ships two **App Functions** that run on Contentful's own infrastructure (no external hosting):

| Function | App Action | What it does |
|---|---|---|
| `listAiActions` | List AI Actions | Returns the space's published AI Actions so the editor can offer them in the menu |
| `translateFields` | Translate Fields | Translates ONE field via your chosen AI Action — plain text directly, Rich Text by batch-translating its text nodes while preserving formatting, links, and embeds |

The entry editor fires one Translate Fields call per field in parallel via `sdk.cma.appActionCall.createWithResponse()` and applies each result through the App SDK field API as it lands — translations stream into the columns live, the Actions button shows `Translating 3/6…`, and there are no CMA version conflicts against the open editor.

**Requirements:** the space needs at least one published AI Action (e.g. a "Translate" action with a Text/StandardInput variable and source/target Locale variables). The menu section hides itself if none exist.

**Developing functions:**
```bash
npm run build:all        # frontend + function bundles
npm run upload           # upload bundle (functions ride along)
npm run upsert-actions   # sync App Actions from contentful-app-manifest.json
```

### Refresh Button
Click the 🔄 button to refresh locale settings if they don't update automatically.

## Project Structure

```
tabulizer/
├── functions/
│   ├── _aiActionProxy.ts          # Shared: invokes an AI Action via context.cma
│   ├── listAiActions.ts           # App Function: list the space's AI Actions
│   └── translateFields.ts         # App Function: translate text fields via AI Action
├── src/
│   ├── App.tsx                    # Location router
│   ├── index.tsx                  # Entry point
│   ├── index.css                  # Global styles
│   ├── locations/
│   │   ├── ConfigScreen.tsx       # Tab/column configuration
│   │   └── EntryEditor.tsx        # Main editor with layouts
│   ├── components/
│   │   ├── TabBar.tsx             # Tab navigation
│   │   ├── TabPanel.tsx           # Tab content container
│   │   ├── FieldList.tsx          # Draggable field item
│   │   ├── FieldRenderer.tsx      # Field editor rendering
│   │   ├── TranslationView.tsx    # Side-by-side translation mode
│   │   └── ContentTypeConfig.tsx  # Per-content-type config
│   ├── hooks/
│   │   └── useTabConfig.ts        # Config reader hook
│   ├── types/
│   │   └── index.ts               # TypeScript interfaces
│   └── utils/
│       ├── appActions.ts          # App Action invocation helpers (AI translation)
│       └── createFieldSDK.ts      # SDK adapter utility
├── build/                         # Production build output
├── vercel.json                    # Vercel deployment config
├── contentful-app-manifest.json   # App definition
├── CONTEXT.md                     # Developer context
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Configuration Data Structure

```typescript
interface TabConfig {
  id: string;
  name: string;
  fieldIds: string[];
  order: number;
}

interface ColumnConfig {
  id: string;
  label: string;
  fieldIds: string[];
}

interface ContentTypeTabSettings {
  enabled: boolean;
  layoutType: 'tabs' | 'columns';
  tabs: TabConfig[];
  columns: ColumnConfig[];
}
```

## Tech Stack

- **React 18** with TypeScript
- **Vite** - Build tool
- **Forma 36** - Contentful's design system
- **@contentful/app-sdk** - Contentful integration
- **@contentful/react-apps-toolkit** - React hooks
- **@dnd-kit** - Drag and drop functionality

## Sharing the App

Tabulizer is hosted on Contentful (bundle upload — no external hosting). To share it with colleagues in the org, send them the install link:

**https://app.contentful.com/deeplink?link=apps&id=22ZgfSfvKkFg2w0dqupXhQ**

1. They pick a space + environment and authorize the app
2. Each space gets its own tab/column configuration
3. AI translation works out of the box against whatever AI Actions that space has published

## Known Limitations

1. **AI Actions**: Direct invocation from iframe not supported. Uses hybrid workflow with native AI menu.
2. **Configuration persistence**: Changes in App Config require page refresh in Entry Editor.
3. **Iframe Sandbox**: Contentful's iframe blocks `window.confirm()`, `window.alert()`, and `window.prompt()`. The app uses Forma 36 modals and `sdk.notifier` instead.

## License

MIT
