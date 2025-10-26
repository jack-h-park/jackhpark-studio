## 🧾 ${{ github.ref_name }} — Release Notes

> The first structured release of the customized **Next.js + Notion Portfolio Framework**,  
> rebuilt from the original [Next.js Notion Starter Kit](https://github.com/transitive-bullshit/nextjs-notion-starter-kit).
>
> This release establishes a full foundation for **RAG ingestion**, **Chat Assistant**, and **Admin workflows**,  
> while introducing refined UI/UX and production-ready configurations.

---

### 🚀 Highlights

#### 🧱 Hybrid SSG + Serverless

- Next.js + React + Vercel Edge runtime
- Incremental Static Regeneration (ISR) for fast, dynamic content
- Dynamic Notion rendering with `react-notion-x`
- Configurable caching via `NOTION_PAGE_CACHE_TTL`

#### 🧩 RAG + Admin Ingestion + Chat Assistant

- End-to-end ingestion pipeline (manual + batch modes)
- SSE-powered progress updates via `/admin/ingestion`
- Embeddings with **OpenAI** → stored in **Supabase**
- Chat Assistant with streaming responses via Edge API (`/api/chat`)

#### 💅 UI/UX Enhancements

- ✨ **SidePeek Panel** — animated drawer for contextual navigation
- 📊 **Mermaid Diagram Rendering** — visual flowcharts embedded in Notion blocks
- 🧭 **Footer & Layout Redesign** — cleaner typography and responsive layout
- 🎨 Custom **Notion CSS overrides** for readability, spacing, and dark-mode balance
- 📱 Improved mobile responsiveness and code-block styling

---

### 🧠 Architecture

#### 🌐 Web Request Flow

```mermaid
flowchart LR
  A["User / Browser"] --> B["Next.js (React)"];
  B --> C["react-notion-x Renderer"];
  C --> D["Notion CMS"];
  B --> E["Vercel Edge / API Routes"];
  E --> F["OpenAI Chat API"];
  E --> G["Supabase (Embeddings DB)"];
  E --> H["Notion Proxy / API Wrapper"];
```

```mermaid
flowchart TD
  A["Notion Page or External URL"] --> B["jsdom + Readability"];
  B --> C["gpt-tokenizer"];
  C --> D["OpenAI Embeddings API"];
  D --> E["Supabase: Documents and Chunks"];

  subgraph "Admin Interface"
    F["Admin Dashboard (/admin/ingestion)"];
  end

  F -- "SSE: progress / log / complete" --> G["API: /api/admin/manual-ingest"];
  G -- "events" --> F;
```
