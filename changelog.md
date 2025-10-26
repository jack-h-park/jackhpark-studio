# Portfolio Website — v0.1.0

![version](https://img.shields.io/badge/version-v0.1.0-blue)
![build](https://img.shields.io/badge/build-Vercel-success)
![license](https://img.shields.io/badge/license-MIT-green)

<!-- Replace the slug below with your repo -->

![commits since](https://img.shields.io/github/commits-since/YOUR_GITHUB_SLUG/v0.1.0)

> Categories: **Hybrid SSG + serverless website** · **RAG + Admin Ingestion + Chat Assistant**

## 1) Hybrid SSG + serverless website

- Next.js + React + `react-notion-x`
- ISR + Edge/Functions on Vercel
- Notion proxy API, Mermaid block rendering
- UX polish: SidePeek, Footer, Notion CSS overrides
- SEO/metadata improvements

**Web Request Flow**

```mermaid
flowchart LR
  A[User] --> B[Next.js]
  B --> C[react-notion-x]
  C --> D[Notion CMS]
  B --> E[Vercel Edge / API]
  E --> H[Notion Proxy]
  E --> F[OpenAI Chat API]
  E --> G[Supabase (read: search/metadata)]
```

## 2) RAG + Admin Ingestion + Chat Assistant

- Ingestion UI (`/admin/ingestion`) + SSE progress
- CLI scripts (`scripts/ingest*.ts`) for batch runs
- Extraction: **jsdom + Readability** → Chunking: **gpt-tokenizer**
- Embeddings: **OpenAI text-embedding-3-small** → **Supabase** upsert
- Chat panel + Edge API (`/api/chat`) with streaming

**Ingestion & RAG Pipeline**

```mermaid
flowchart TD
  A[Notion/URL] --> B[Extract (jsdom + Readability)]
  B --> C[Chunk (gpt-tokenizer)]
  C --> D[Embed (OpenAI)]
  D --> E[Store (Supabase)]

  subgraph Admin
    F[/admin/ingestion/]
    F <-- SSE --> G[/api/admin/manual-ingest]
  end

  subgraph CLI
    H[scripts/ingest.ts]
    I[scripts/ingest-notion.ts]
    H --> G
    I --> G
  end
```

## Config & Tooling

- `.env`: `ADMIN_DASH_USER`, `ADMIN_DASH_PASS`, `NOTION_PAGE_CACHE_TTL`, `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- Lint: `next/core-web-vitals`, `eslint-plugin-simple-import-sort`
- Clients: `lib/core/openai.ts`, `lib/core/supabase.ts`

## Credits

Base: **transitive-bullshit/nextjs-notion-starter-kit** · Author: **Jack Park** · Hosting: **Vercel** · CMS: **Notion**
