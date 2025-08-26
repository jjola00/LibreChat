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

# Set up ChromaDB (if not already running)
docker run -p 8000:8000 chromadb/chroma
```

### 2. Configuration

Copy and modify the configuration in `config.js`:

### 3. Initial Setup

```bash
# Run the setup script
node setup.js
```

### 4. Start Using

The system is now available in LibreChat as the "Dogpatch Knowledge Base" tool!

## 📖 Usage Examples

### Basic Queries
```
User: "How do I request annual leave?"
Assistant: Based on our HR policy, here's how to request annual leave:
1. Submit request through Personio platform
2. Get manager approval
3. Update team calendar
4. Notify HR team

For questions, contact: hr@dogpatchlabs.com
Confidence: High (92%)
```

### Knowledge Gap Detection
```
User: "What's the procedure for requesting a company laptop?"
Assistant: I don't have complete information about laptop request procedures 
in our knowledge base. I'm automatically reaching out to our IT team to 
gather this information for you.

In the meantime, you can contact: it@dogpatchlabs.com

Note: I've detected a knowledge gap and am working to improve our 
documentation in this area.
```

### Expert Workflow Triggered
```
User: "How do I access the new project management system?"
Assistant: I found limited information about our project management system. 
I've automatically contacted our IT manager for complete setup instructions.

Expected response time: 2-4 hours
Request ID: req_abc123

I'll update our knowledge base once I receive the information.
```

## 🔧 Configuration

### Environment Variables

```bash
# Required
OPENAI_API_KEY=sk-proj-your-api-key
CHROMA_URL=http://localhost:8000

# Optional - Employee Directory
EMPLOYEE_API_URL=https://your-hr-system/api/employees
EMPLOYEE_API_KEY=your-api-key

# Optional - Communication
SLACK_WEBHOOK_URL=https://hooks.slack.com/your-webhook
SMTP_HOST=smtp.your-domain.com
SMTP_PORT=587
SMTP_USER=no-reply@dogpatchlabs.com
SMTP_PASS=your-smtp-password

# Optional - Features
EMAIL_ENABLED=true
LOG_LEVEL=info
```

### Knowledge Base Configuration

```javascript
// Customize in config.js
knowledgeGap: {
  confidenceThreshold: 0.7,
  similarityThreshold: 0.75,
  maxRetrievedDocs: 5,
},

agentWorkflow: {
  enabled: true,
  escalationTimeout: 24 * 60 * 60 * 1000, // 24 hours
  retryAttempts: 3,
},

safety: {
  piiDetection: true,
  contentModeration: true,
  rateLimit: {
    queriesPerMinute: 60,
    updatesPerHour: 10,
  },
},
```

## 📊 Monitoring & Analytics

### Access System Status
```
User: "knowledge base status"
Assistant: 
# 📊 Knowledge Base Status

## 📚 Document Statistics
- Total Documents: 156
- Collection: dogpatch-knowledge
- Last Updated: 2024-01-15T10:30:00Z

## 🔍 Knowledge Gap Analysis
- Total Analyses: 45
- Gaps Detected: 12
- Average Confidence: 84%

## ⚡ System Status
- Status: 🟢 Operational
- Last Check: 2024-01-15T10:35:00Z
```

### Log Files Location
- Query logs: `data/logs/queries.jsonl`
- Performance metrics: `data/logs/performance.jsonl`
- Knowledge gaps: `data/logs/knowledge_gaps.jsonl`
- Workflow logs: `data/logs/workflows/`

## 🔄 Workflows

### 1. Knowledge Gap Detection Flow
```
User Query → Vector Search → Confidence Analysis → Gap Detection
     ↓
Gap Detected → Expert Identification → Contact Expert → Monitor Response
     ↓
Response Received → Process Information → Update Knowledge Base
```

### 2. Expert Contact Workflow
```
Gap Detected → Analyze Domain → Find Expert → Send Request
     ↓
Set Timeout → Monitor Response → Process or Escalate
     ↓
Update Complete → Notify User → Log Success
```

### 3. Knowledge Update Flow
```
New Information → Validate Content → Check Conflicts → Backup DB
     ↓
Human Approval? → Apply Updates → Update Metadata → Log Changes
```

## 🛠️ Advanced Features

### Custom Expert Mapping
```javascript
// Add domain experts
ragEngine.contactLocator.addExpert({
  id: 'expert-1',
  name: 'John Smith',
  email: 'john@dogpatchlabs.com',
  domain: 'IT',
  expertise: ['network', 'security', 'hardware'],
  responseTime: 120, // minutes
});
```

### Manual Knowledge Updates
```javascript
// Add information manually
await ragEngine.ingestDocuments([{
  content: 'New procedure for...',
  metadata: {
    title: 'New Process',
    category: 'HR',
    author: 'Admin',
  },
}]);
```

### Batch Document Processing
```javascript
// Process entire directory
await ragEngine.ingestDocuments('/path/to/documents/', {
  recursive: true,
  includePatterns: ['*.pdf', '*.docx'],
});
```

## 🔐 Security Features

### PII Detection
- Automatically detects and flags sensitive information
- Prevents accidental storage of personal data
- Configurable detection patterns

### Access Control
- User-based permissions
- Role-based document access
- Audit trail for all operations

### Content Moderation
- Prohibited content detection
- Safe content filtering
- Human review workflows

## 🚀 Performance Optimization

### Vector Database Optimization
- Efficient embedding strategies
- Optimized chunk sizes
- Smart similarity thresholds

### Caching
- In-memory query caching
- Processed information caching
- Metadata caching

### Rate Limiting
- Query rate limiting
- Update frequency controls
- Resource usage monitoring

## 🔧 Troubleshooting

### Common Issues

1. **ChromaDB Connection Error**
   ```bash
   # Ensure ChromaDB is running
   docker run -p 8000:8000 chromadb/chroma
   ```

2. **OpenAI API Errors**
   - Check API key validity
   - Verify rate limits
   - Monitor usage quotas

3. **Knowledge Gap Not Detected**
   - Adjust confidence thresholds
   - Check similarity thresholds
   - Review query preprocessing

4. **Expert Contact Failures**
   - Verify email/Slack configuration
   - Check expert directory setup
   - Review communication templates

### Debug Mode
```bash
# Enable debug logging
LOG_LEVEL=debug node setup.js
```

### Health Checks
```javascript
// Check system health
const stats = await ragEngine.getStatistics();
console.log('System health:', stats);
```

## 🤝 Contributing

### Adding New Features
1. Follow the modular architecture
2. Add comprehensive logging
3. Include error handling
4. Write tests for new functionality

### Extending Workflows
1. Create new workflow types in `agents/`
2. Register in `AgentWorkflowManager`
3. Add configuration options
4. Test thoroughly

## 📝 License

This project is part of LibreChat and follows the same license terms.

## 🆘 Support

For issues and questions:
- Check the troubleshooting section
- Review log files for errors
- Contact the development team
- Create an issue in the LibreChat repository

---

**Built with ❤️ for Dogpatch Labs using LibreChat**
