# 🤖 Self-Improving RAG System for LibreChat

A comprehensive, self-improving Retrieval-Augmented Generation (RAG) system that automatically identifies knowledge gaps and gathers missing information through automated workflows.

## 🌟 Features

### Core Capabilities
- **🔍 Smart Knowledge Retrieval**: Vector-based search across company documents
- **🧠 Knowledge Gap Detection**: Automatically identifies when information is missing or incomplete
- **🤖 Agent Workflows**: Automatically contacts experts when knowledge gaps are detected
- **📚 Self-Improving**: Updates knowledge base with new information from experts
- **📊 Comprehensive Logging**: Tracks all queries, gaps, and improvements
- **🔒 Safety & Security**: PII detection, content moderation, and access controls

### Advanced Features
- **Confidence Scoring**: Provides confidence levels for all responses
- **Expert Contact System**: Automatically routes queries to appropriate domain experts
- **Conflict Resolution**: Handles conflicting information intelligently
- **Backup & Recovery**: Automatic backups before knowledge base updates
- **Human Approval**: Optional human review for sensitive updates
- **Real-time Monitoring**: Performance metrics and system health monitoring

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   LibreChat     │────│  RAG Engine      │────│  Vector DB      │
│   Integration   │    │                  │    │  (ChromaDB)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                    ┌─────────┼─────────┐
                    │         │         │
            ┌───────▼───┐ ┌───▼────┐ ┌──▼─────────┐
            │Knowledge  │ │Agent   │ │Logging     │
            │Gap        │ │Workflow│ │System      │
            │Detector   │ │Manager │ │            │
            └───────────┘ └────────┘ └────────────┘
                              │
                    ┌─────────┼─────────┐
                    │         │         │
            ┌───────▼───┐ ┌───▼────┐ ┌──▼─────────┐
            │Contact    │ │Comm    │ │Information │
            │Locator    │ │Manager │ │Processor   │
            └───────────┘ └────────┘ └────────────┘
```

## 🚀 Quick Start

### 1. Prerequisites

```bash
# Install dependencies
cd /path/to/LibreChat/api/app/clients/tools/rag-improver
npm install

# Set up ChromaDB (using port 8001 to avoid conflicts)
docker run -d --name chroma-rag -p 8001:8000 chromadb/chroma
```

### 2. Google Drive Setup

The system loads documents from Google Drive using environment variables configured in LibreChat's `.env` file:

**Required Environment Variables:**
```bash
# Google Drive credentials
GOOGLE_APPLICATION_CREDENTIALS=./secrets/librechat-470216-89cbc7001a64.json
GOOGLE_DRIVE_CREDENTIALS_PATH=./secrets/librechat-470216-89cbc7001a64.json

# Target folder configuration  
TEST_CONTEXT_FOLDER_NAME=Test Context
TEST_CONTEXT_FOLDER_ID=16Pr0nUKX7urr6E0Z672M1bBbFmdr1Bkk
```

**Supported Files**: Google Docs, Sheets, Slides, PDFs, text files, and Office documents

**Important**: 
- Ensure the target folder is shared with the service account email
- All required Google APIs (Drive, Docs, Sheets, Slides) must be enabled
- Use either folder name OR folder ID (folder ID is preferred for performance)

### 3. Configuration

All configuration comes from environment variables in LibreChat's root `.env` file:

- **Google Drive Integration**: Enabled by default
- **Target Folder**: From `TEST_CONTEXT_FOLDER_NAME` or `TEST_CONTEXT_FOLDER_ID`
- **ChromaDB URL**: `http://localhost:8001` 
- **Credentials Path**: From `GOOGLE_DRIVE_CREDENTIALS_PATH` or `GOOGLE_APPLICATION_CREDENTIALS`
- **Refresh Interval**: 24 hours

### 4. Initial Setup

```bash
# Run the setup script to load Google Drive content
node setup.js
```

The setup will:
- Connect to Google Drive
- Find the "Test Context" folder
- Extract content from all supported files
- Process and embed the content
- Load it into the vector database