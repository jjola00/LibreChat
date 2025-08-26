# 🚀 Deployment Guide: Self-Improving RAG System

This guide will help you deploy the Self-Improving RAG System for Dogpatch Labs in a production environment.

## 📋 Prerequisites

### System Requirements
- **Node.js**: 18.x or higher
- **Memory**: Minimum 4GB RAM (8GB recommended)
- **Storage**: Minimum 10GB free space
- **Docker**: For ChromaDB (recommended)

### External Services
- **OpenAI API**: Active account with API access
- **ChromaDB**: Vector database (can run via Docker)
- **SMTP Server**: For email notifications (optional)
- **Slack Workspace**: For notifications (optional)

## 🔧 Installation Steps

### 1. Install Dependencies

```bash
cd /path/to/LibreChat/api/app/clients/tools/rag-improver
npm install
```

### 2. Set Up ChromaDB

#### Option A: Docker (Recommended)
```bash
# Run ChromaDB in Docker (using port 8001 to avoid conflicts)
docker run -d \
  --name chroma-rag \
  -p 8001:8000 \
  -v chroma-data:/chroma/chroma \
  chromadb/chroma:latest

# Verify it's running
curl http://localhost:8001/api/v1/heartbeat
```

#### Option B: Local Installation
```bash
pip install chromadb
chroma run --host 0.0.0.0 --port 8001
```

### 3. Configure Environment Variables

**Note**: The system automatically loads environment variables from LibreChat's root `.env` file. If you already have `OPENAI_API_KEY` configured in LibreChat, no additional setup is needed.

For custom configuration, you can create a `.env` file in the `rag-improver` directory:

```bash
# Required Configuration
OPENAI_API_KEY=sk-proj-your-openai-api-key-here
CHROMA_URL=http://localhost:8001

# Optional - Employee Directory Integration
EMPLOYEE_API_URL=https://your-hr-system.com/api/employees
EMPLOYEE_API_KEY=your-employee-api-key

# Optional - Communication Settings
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/your/webhook/url
EMAIL_ENABLED=true
SMTP_HOST=smtp.your-domain.com
SMTP_PORT=587
SMTP_USER=no-reply@dogpatchlabs.com
SMTP_PASS=your-smtp-password

# Optional - System Settings
LOG_LEVEL=info
RAG_USE_FULL_CONTEXT=false
```

### 4. Initialize the System

```bash
# Install additional dependencies that may be needed
npm install

# Run the setup script
node setup.js
```

This will:
- Create necessary directories
- Initialize the vector database
- Load sample company data
- Verify system functionality
- Run basic tests

**Expected Output**: You should see a successful setup with sample documents loaded and all tests passing.

### 5. Run Tests

```bash
# Validate the installation
node test.js
```

All tests should pass before proceeding to production.

## 🔄 Integration with LibreChat

### 1. Verify Integration

The system should automatically appear as a tool in LibreChat. Verify by:

1. Starting LibreChat
2. Creating a new conversation
3. Looking for "Dogpatch Knowledge Base" in available tools

### 2. Test Integration

```bash
# In LibreChat, test with these queries:
# "How do I request annual leave?"
# "What is the WiFi password?"
# "knowledge base status"
```