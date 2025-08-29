# LibreChat Augmented | Handover

## Summary

- **Current Status**: ✅ **LIVE**
- **What's Live**: Docker containers running on localhost:3080 with MongoDB, PostgreSQL vector DB, RAG API, and LibreChat main app
- **Biggest Open Risks**: 
  - SSO not configured (Google/Microsoft OAuth keys missing)
  - RAG system needs production data ingestion
  - ImproveBot requires approval workflow setup
  - No production deployment pipeline configured

## Scope vs. Brief

| Brief Item | Status | Evidence |
|------------|--------|----------|
| **SSO (Google/Microsoft)** | 🚧 **Partial** | OAuth routes implemented (`api/server/routes/oauth.js`), env vars defined but not configured |
| **PWA/Mobile** | ✅ **Done** | PWA manifest configured (`client/vite.config.ts`), service worker enabled, mobile meta tags |
| **Core Chat** | ✅ **Done** | LibreChat v0.8.0-rc2 running with OpenAI integration (`librechat.yaml`) |
| **Admin Features** | ✅ **Done** | User management, role-based access, moderation tools available |
| **Feature Exploration** | ✅ **Done** | Agents, MCP, tools, code interpreter all implemented |
| **Branding** | ⛔ **Not Started** | Default LibreChat branding, no custom assets |
## Architecture & Environments

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   LibreChat     │────│  RAG Engine      │────│  Vector DB      │
│   Frontend      │    │  (Port 8000)     │    │  (PostgreSQL)   │
│   (Port 3080)   │    │                  │    │  (Port 5433)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   MongoDB       │    │  ImproveBot      │    │  File Storage   │
│   (Port 27017)  │    │  System          │    │  (Local/Cloud)  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

**Services:**
- **LibreChat API**: Node.js/Express on port 3080
- **RAG API**: Python service on port 8000 (`ghcr.io/danny-avila/librechat-rag-api-dev-lite`)
- **Vector DB**: PostgreSQL with pgvector extension on port 5433
- **MongoDB**: Document store on port 27017
- **Frontend**: React/Vite PWA with service worker

**Data Stores:**
- **MongoDB**: Users, conversations, messages, agents
- **PostgreSQL**: Vector embeddings, RAG documents
- **Local Storage**: File uploads, system prompts, logs

**External APIs:**
- **OpenAI**: Primary LLM provider (GPT-4o-mini)
- **Google OAuth**: SSO authentication (not configured)
- **Microsoft Graph**: SSO authentication (not configured)

**Auth/SSO Flow:**
```
User → LibreChat → OAuth Provider → Callback → JWT Token → Session
```

**Network Ports:**
- 3080: LibreChat main app
- 8000: RAG API
- 5433: PostgreSQL vector DB
- 27017: MongoDB
- 3090: Frontend dev server

**Environment Variables:**
- in `env.local` file

## Deploy & Run

**Local Development:**
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f librechat

# Access app
open http://localhost:3080
```

**Required .env Keys:**
```bash
# Required for basic functionality
OPENAI_API_KEY=sk-...

# Required for SSO
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
# OR
OPENID_CLIENT_ID=your-microsoft-client-id
OPENID_CLIENT_SECRET=your-microsoft-client-secret
OPENID_ISSUER=https://login.microsoftonline.com/your-tenant-id/v2.0

# Required for RAG
RAG_OPENAI_API_KEY=sk-...
EMBEDDINGS_PROVIDER=openai
EMBEDDINGS_MODEL=text-embedding-3-small
```

**Health Checks:**
- LibreChat: `curl http://localhost:3080/api/config`
- RAG API: `curl http://localhost:8000/health`
- MongoDB: `docker exec librechat-mongo-1 mongosh --eval "db.adminCommand('ping')"`
- PostgreSQL: `docker exec librechat-pgvector pg_isready -U rag -d rag`

**Tests:**
```bash
# Run all tests
npm test

# Run specific test suites
npm run test:api
npm run test:client
npm run test:e2e
```

**Build PWA:**
```bash
# Build production PWA
cd client && npm run build

# Build includes service worker and manifest
# Assets copied to dist/ automatically
```

**Enable SSO:**
1. Configure OAuth app in Google/Microsoft developer console
2. Set callback URLs: `http://localhost:3080/oauth/google/callback`
3. Add client ID/secret to `.env.local`
4. Restart containers: `docker-compose restart`

## RAG Status

**What's Implemented:**
- ✅ Vector database (PostgreSQL + pgvector)
- ✅ Document processing (PDF, DOCX, TXT, MD)
- ✅ Embedding generation (OpenAI text-embedding-3-small)
- ✅ Retrieval system with similarity search
- ✅ Knowledge gap detection
- ✅ Agent workflow system for expert contact
- ✅ Google Drive integration for document ingestion

**Data Loaders:**
- Local file upload via LibreChat UI
- Google Drive folder sync
- Directory batch processing
- Manual document ingestion API

**Chunking/Embeddings:**
- Recursive character text splitter (1000 chars, 200 overlap)
- OpenAI embeddings with batch processing
- Metadata preservation (source, timestamp, user)

**Vector Store:**
- PostgreSQL with pgvector extension
- Collection: `dogpatch-knowledge`
- Indexed for similarity search
- Backup/restore capabilities

**Retrieval Flow:**
```
Query → Embedding → Vector Search → Context Assembly → LLM Response
```

**Known Limitations:**
- No production data loaded yet
- Knowledge gap detection needs tuning
- Expert contact system requires Slack/email setup
- No automated knowledge base updates

**Eval Notes:**
- Basic retrieval working in development
- Need production documents for testing
- Confidence scoring needs calibration

**Next Steps (Priority-ordered):**
1. **S** - Load production documents into RAG system
2. **S** - Configure expert contact system (Slack webhooks)
3. **M** - Tune knowledge gap detection thresholds
4. **M** - Set up automated knowledge base updates
5. **L** - Implement conflict resolution for conflicting information

## Self-Improving System Prompt (ImproveBot)

**Current Design:**
- Shell-based workflow for prompt improvement
- LLM-generated unified diffs
- Human approval workflow
- Persistent changelog tracking

**Trigger Method:**
```bash
# Interactive improvement
improvebot/improve.sh -- "Add HR routing: if asked 'who do I ask for annual leave?' answer 'Use the Personio platform.'"

# Auto-apply (CI-friendly)
ALLOWED_PROMPT_FILE="system_prompt/system_prompt.md" \
improvebot/improve.sh -y -- "Add HR routing for annual leave via Personio"
```

**Prompt Storage/Update Path:**
- Source: `system_prompt/system_prompt.md`
- Changelog: `system_prompt/prompt_changelog.md`
- Backup: Git version control

**Change-log Format:**
```markdown
## 2025-08-28 — Approved by JJ
**Why:** User-approved improvement to system prompt
**Summary:** Minimal change to add capability
**Expected impact:** Better responses and clearer guidance
**Diff:** [unified diff format]
```

**Review/Approval Loop:**
1. Generate diff with LLM
2. Validate diff format and scope
3. Human review and approval
4. Apply changes and update changelog
5. Git commit for version control

**Guardrails:**
- First line protection (identity preservation)
- File scope restrictions
- Security: No API keys or PII
- Style: "Straight to the point" preference

**What's Working:**
- ✅ Diff generation and validation
- ✅ Changelog tracking
- ✅ Human approval workflow
- ✅ Git integration

**What's Missing:**
- ⛔ Integration with LibreChat UI
- ⛔ Automated testing of prompt changes
- ⛔ Rollback capabilities
- ⛔ Team approval workflows

**Next Steps to Ship v1:**
1. **S** - Add UI integration for prompt management
2. **S** - Implement automated testing of prompt changes
3. **M** - Add rollback functionality
4. **M** - Create team approval workflows
5. **L** - Add prompt performance analytics

## Integrations & MCP/Agents

**Slack/Gmail/HubSpot Possibilities:**
- **Slack**: Webhook integration for expert notifications (configured but not tested)
- **Gmail**: OAuth-based email sending for expert contact (configured but not tested)
- **HubSpot**: No integration found, would need custom MCP server

**What's Prototyped:**
- ✅ MCP server framework (`api/server/routes/mcp.js`)
- ✅ OAuth flow for MCP servers
- ✅ Agent workflow system with communication manager
- ✅ Google Drive integration for document ingestion

**Blockers:**
- No production OAuth apps configured
- Slack webhook URL not set
- Email SMTP settings not configured
- No HubSpot API integration

**Recommended MVP Path:**
1. **S** - Configure Slack webhook for expert notifications
2. **S** - Set up email SMTP for expert contact
3. **M** - Create HubSpot MCP server for CRM integration
4. **L** - Build comprehensive workflow automation

## Backlog

### Now (S)
- Configure SSO with Google/Microsoft OAuth
- Load production documents into RAG system
- Set up Slack webhook for expert notifications
- Add UI integration for ImproveBot

### Next (M)
- Implement automated testing for prompt changes
- Tune knowledge gap detection thresholds
- Create HubSpot MCP server
- Set up monitoring and alerting

### Later (L)
- Build comprehensive workflow automation
- Implement data retention policies
- Add prompt performance analytics
- Create production deployment pipeline

## Links & Assets

**Repo Paths:**
- Main app: `http://localhost:3080`
- RAG API: `http://localhost:8000`
- API docs: `http://localhost:3080/api/config`
- PWA manifest: `http://localhost:3080/manifest.webmanifest`

**Dashboards:**
- No monitoring dashboards configured
- Docker container status: `docker ps`
- Logs: `docker-compose logs -f`

---

**Last Updated:** 2025-08-29 