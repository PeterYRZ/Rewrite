# 全文段落改写 / Paragraph Rewriter

[![Release](https://img.shields.io/github/v/release/PeterYRZ/Rewrite?style=flat-square)](https://github.com/PeterYRZ/Rewrite/releases)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

An interactive multi-round paragraph rewriting application. Users submit an article, select specific paragraphs, and the system rewrites only those paragraphs while maintaining logical coherence across the full text. Each round can target different paragraphs, with all results accumulated incrementally.

It features a side-by-side diff view (similar to VS Code Git Diff), supporting batch paragraph selection, parallel streaming generation, per-paragraph review (accept/guided rewrite/manual edit), and multi-round incremental rewriting.

<p align="center">
  <img src="screenshots/main-interface.png" alt="Main Interface" width="90%">
</p>

## Features

- **Multi-Agent Architecture**: Scheduler (stateful), Generator, Validator, and Semantic Analyzer agents working together
- **Dual-Pane Diff View**: Left panel shows current draft, right panel shows streaming rewrite results
- **Parallel SSE Streaming**: All target paragraphs are rewritten concurrently with real-time token streaming
- **Multi-Round Editing**: Commit a round, continue editing — full round history preserved
- **Guided Rewrite**: Inline guidance input for per-paragraph natural language instructions
- **Version Tracking**: Per-paragraph version history with preview and restore
- **User Authentication**: Access Key based authentication with admin panel for user management
- **i18n**: Chinese and English language support
- **Debug Mode**: `?debug=true` enables progress bars, SSE event log, and server log viewer
- **Model Config**: Hot-swap models, adjust temperature, add/delete models at runtime

## Quick Start

### Option A: Docker Compose (Recommended)

```bash
# 1. Clone the repository
git clone https://github.com/PeterYRZ/Rewrite.git
cd Rewrite

# 2. Prepare configuration
cp config.yaml.example config.yaml
# Edit config.yaml to set your API keys
cp users.json.example users.json

# 3. Start with Docker Compose
docker compose up
```

The app will be available at **http://localhost:5173**.

To change ports, set environment variables before starting:
```bash
SERVER_PORT=9000 FRONTEND_PORT=3000 docker compose up
```

### Option B: Pull from GitHub Container Registry

```bash
# Pull the pre-built image
docker pull ghcr.io/peteryrz/rewrite:latest

# Run
docker run -p 8000:8000 \
  -v $(pwd)/config.yaml:/app/config.yaml \
  -v $(pwd)/users.json:/app/users.json \
  ghcr.io/peteryrz/rewrite:latest
```

Available tags: `latest`, `v0.1.0`, `v0.1`, `v0`. See [releases](https://github.com/PeterYRZ/Rewrite/releases).

### Option C: Build Locally

```bash
docker build -t paragraph-rewriter .
docker run -p 8000:8000 \
  -v $(pwd)/config.yaml:/app/config.yaml \
  -v $(pwd)/users.json:/app/users.json \
  paragraph-rewriter
```

The app will be available at **http://localhost:8000** (or your custom port).

### Option D: Manual Setup

**Prerequisites**: Python 3.14+, Node.js 22+

```bash
# 1. Clone and configure
git clone https://github.com/PeterYRZ/Rewrite.git
cd Rewrite
cp config.yaml.example config.yaml   # Set your API keys
cp users.json.example users.json

# 2. Backend
uv sync
export $(grep -v '^#' .env 2>/dev/null | xargs)  # Load env vars if using .env
uv run rewrite-server

# 3. Frontend (in a separate terminal)
cd web
npm install
npm run dev
```

Backend runs on **http://localhost:8000** (configurable via `config.yaml` → `server.port`), frontend on **http://localhost:5173**. If you change the backend port, set `VITE_API_PORT` before starting the frontend:
```bash
VITE_API_PORT=9000 npm run dev
```

## Configuration

### config.yaml

Copy `config.yaml.example` to `config.yaml` and configure:

```yaml
server:
  port: 8000           # Backend API port
  frontend_port: 5173  # Frontend dev server port

models:
  - name: gpt-4o
    provider: openai
    model: gpt-4o
    api_key: "$OPENAI_API_KEY"    # or set directly

rewrite:
  temperature: 0.7
  max_tokens: 2000
  candidates_count: 3

validation:
  enabled: true
  strictness: "medium"
```

The backend port is read from `config.yaml` at startup. For the frontend, set `VITE_API_PORT` to the backend port when running manually (defaults to 8000).

API keys can be set directly in `config.yaml` (keep this file gitignored) or referenced as environment variables using `$VARIABLE_NAME` syntax.

### users.json

Copy `users.json.example` to `users.json`:

```json
{
  "users": [
    { "username": "admin", "access_key": "rw-admin-xxxx", "role": "admin" },
    { "username": "demo", "access_key": "rw-demo-xxxx", "role": "user" }
  ]
}
```

Login with an Access Key on the auth page. The admin user can manage other users via the admin panel.

## Architecture

```
┌──────────────┐
│  Scheduler    │ ← Stateful coordinator (state machine, context assembly, multi-round)
└──────┬───────┘
       │ Direct function calls
  ┌────┼────┬────────┐
  ▼    ▼    ▼        ▼
Generator  Validator  Semantic Analyzer (stateless)
```

- **Dual-Document Context**: Original document (immutable) + Current document (with status markers)
- **SSE Streaming**: Server-Sent Events via FastAPI `StreamingResponse` + `asyncio.Queue`
- **Session Model**: Multi-round rewrite sessions with full history

For detailed architecture documentation, see [docs/tech-spec.md](docs/tech-spec.md).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.14, FastAPI, Pydantic, uvicorn |
| LLM | OpenAI SDK, Ollama (provider abstraction) |
| Frontend | React 19, Vite, Tailwind CSS 4, TypeScript |
| Streaming | SSE (Server-Sent Events) |
| Auth | Access Key with in-memory token management |

## Development

```bash
# Backend
uv sync
uv run rewrite-server

# Frontend
cd web
npm install
npm run dev

# Run tests
uv run pytest

# Build frontend for production
cd web && npm run build
```

## Project Structure

```
Rewrite/
├── src/rewrite_engine/
│   ├── agents/          # 4 agents (Scheduler, Generator, Validator, Analyzer)
│   ├── api/             # FastAPI server + auth
│   ├── llm/             # LLM provider abstraction
│   ├── models/          # Data models (Article, Session, Config)
│   └── pipelines/       # Rewrite pipelines (auto + interactive)
├── web/                 # React frontend
│   └── src/
│       ├── components/  # UI components
│       ├── hooks/       # Custom React hooks
│       ├── i18n/        # Internationalization
│       └── locales/     # zh-CN.json, en.json
├── docs/                # Technical spec + dev log
├── data/                # Sample articles + test cases
└── config.yaml.example  # Configuration template
```

## License

MIT
