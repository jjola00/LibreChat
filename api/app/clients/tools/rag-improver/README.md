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

### 2. Configuration

The system automatically loads environment variables from LibreChat's root `.env` file. No additional configuration needed if you already have `OPENAI_API_KEY` set.

To customize settings, modify `config.js`:
- ChromaDB URL (default: `http://localhost:8001`)  
- Confidence thresholds
- Expert contact settings
- Logging preferences

### 3. Initial Setup

```bash
# Run the setup script
node setup.js
```