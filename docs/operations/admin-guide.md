# Admin & Operations Guide

This guide details the operational workflows for managing the AI Assistant's data and configuration. It covers the **Admin Dashboard** (Ingestion, Documents, Global Config) and the **User Chat Interface** (Session Settings).

---

## 1. Ingestion Dashboard

**Location:** `/admin/ingestion`

The Ingestion Dashboard is the control center for updating the RAG knowledge base. It allows operators to trigger manual indexing runs and monitor system health.

### Manual Ingestion Panel

Use this panel to "push" new content into the vector database immediately.

#### Modes

1.  **Notion Page:** Syncs content from the connected Notion workspace.
    - **Scope:**
      - `Workspace`: Scans _all_ accessible pages.
      - `Selected`: Ingests a specific Page ID.
    - **Linked Pages:** Optionally crawls child pages and linked references (recursive depth limited by system config).
2.  **External URL:** Scrapes and ingests a public web article.
    - _Note:_ Uses `readability` to strip ads and navigation.

#### Update Strategies

- **Only pages with changes (Partial):** The default. Checks `content_hash` and `last_edited_time` before processing. Skips unchanged content to save tokens.
- **Re-ingest all pages (Full):** Forces a complete re-processing of selected pages. Use this if you changed chunks sizes or embedding models and need to rebuild vectors.

#### Embedding Model Selection

You can select which embedding provider (e.g., `openai`, `gemini`) to use for the run. This allows for A/B testing different vector spaces.

### Run History & Logs

- **Recent Runs:** Shows the last 50 ingestion jobs.
- **Logs:** Real-time stream of the current job. Filters available for `Info`, `Warn`, and `Error`.

---

## 2. RAG Document Management

**Location:** `/admin/documents`

This view provides a searchable registry of all content currently indexed in the vector database.

### Search & Filters

You can drill down into the knowledge base using:

- **Search:** Matches against `title` or `doc_id`.
- **Doc Type:** Filter by metadata type (e.g., `project_article`, `blog_post`).
- **Persona:** Filter by associated persona (e.g., `engineer`, `product_manager`).
- **Visibility:** Show Public vs. Private documents.

### Document Details

Clicking a document title reveals:

- **Chunks:** The number of vector chunks stored.
- **Source:** Direct link to the Notion page or URL.
- **Timestamps:** `Last Ingested` and `Last Source Update`.

---

## 3. Chat Configuration (Admin)

**Location:** `/admin/chat-config`

This section controls the **Global Defaults** for the chat assistant. Changes here affect _all_ new user sessions unless overridden.

### Global Presets

Defines the baseline behavior:

- **System Prompt:** The core instructions (e.g., "You are a helpful engineering assistant...").
- **Default Model:** The LLM (e.g., `gpt-4o`, `gemini-pro`) used for standard queries.
- **Temperature:** Creativity setting (0.0 = deterministic, 1.0 = creative).

### Guardrails

- **Context Limit:** Max tokens reserved for RAG context (default: ~4000).
- **History Limit:** Max tokens reserved for conversation history.
- **Retrieval Thresholds:** Minimum similarity score (0.78) required to include a chunk.

---

## 4. User Chat Settings

**Location:** Chat Interface > "App Settings" (Gear Icon)

Users can customize their _current session_ without affecting global defaults.

### Hierarchy of Settings

The system resolves configuration in this order (highest priority first):

1.  **Session Overrides** (User Settings Drawer)
2.  **Admin Presets** (Global Config)
3.  **Environment Defaults** (`.env` file)

### Available Controls

- **Advanced Settings:**
  - **Model:** Switch between available LLMs (including Local LLMs if configured).
  - **Temperature:** Adjust response randomness.
- **Safe Mode:**
  - **Toggle:** When enabled, disables _all_ RAG retrieval and complex tool use.
  - **Use Case:** Enable this if the assistant is hallucinating or if vector search is experiencing latency. It forces the bot to reply using _only_ its internal training knowledge.
- **Debug Dashboard:**
  - Visible only to admins. Shows retrieval scores, latency breakdown, and specific chunks used for the last response.
