# 🍋 CurationsLA - Content Sourcing & Ghost Drafts

**Purpose**: Content sourcing and Ghost Pro draft creation ONLY for la.curations.cc

## What This Does
- Sources content from LA RSS feeds and APIs
- Filters content for "Good Vibes" only (no negativity)
- Creates draft posts in Ghost Pro for manual review
- **NO subscriber management, NO publishing automation**

## Structure
```
lemon/
├── src/
│   └── content-sourcer.js         # Main Cloudflare Worker
├── config/
│   └── sources.json               # RSS feeds and filter rules
├── .github/workflows/
│   └── content-to-draft.yml       # GitHub Action
├── wrangler.toml                   # Cloudflare configuration
└── package.json                    # Dependencies
```

## Deployment

### 1. Cloudflare Setup (Updated API Permissions)
```bash
# Deploy the content sourcing worker
npm run deploy

# Create KV namespace (run once)
wrangler kv:namespace create "CONTENT_KV"
```

### 2. Environment Variables
Set these in Cloudflare dashboard:
- `GHOST_ADMIN_API_KEY` - Ghost Pro admin API key
- `GHOST_API_URL` - https://curationsla-1.ghost.io

### 3. Routes
- Production: `curationsla-content-sourcer.workers.dev`
- Staging: `curationsla-content-sourcer-staging.workers.dev`

## API Endpoints

### `/api/source-content`
Sources content from configured RSS feeds

### `/api/create-draft`
Creates a draft post in Ghost Pro
```json
{
  "title": "Newsletter Title",
  "content": "HTML content",
  "publicationDate": "2024-01-15"
}
```

### `/health`
Health check endpoint

## Automated Schedule
- Daily content sourcing at 6 AM PT
- Content stored in KV for processing
- Manual draft creation via GitHub Actions

## Separation from Agency
This repository handles ONLY:
✅ Content sourcing
✅ Ghost draft creation
✅ Good Vibes filtering

Does NOT handle:
❌ Subscriber management
❌ Email sending
❌ Publishing automation
❌ Agency marketing content