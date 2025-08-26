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
# Run ChromaDB in Docker
docker run -d \
  --name chroma-db \
  -p 8000:8000 \
  -v chroma-data:/chroma/chroma \
  chromadb/chroma:latest

# Verify it's running
curl http://localhost:8000/api/v1/heartbeat
```

#### Option B: Local Installation
```bash
pip install chromadb
chroma run --host 0.0.0.0 --port 8000
```

### 3. Configure Environment Variables

Create a `.env` file in the `rag-improver` directory:

```bash
# Required Configuration
OPENAI_API_KEY=sk-proj-your-openai-api-key-here
CHROMA_URL=http://localhost:8000

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
# Run the setup script
node setup.js
```

This will:
- Create necessary directories
- Initialize the vector database
- Load sample company data
- Verify system functionality
- Run basic tests

### 5. Run Tests

```bash
# Validate the installation
node test.js
```

All tests should pass before proceeding to production.

## 🔒 Security Configuration

### 1. API Key Security
```bash
# Ensure environment variables are properly secured
chmod 600 .env
```

### 2. Database Security
```bash
# If using external ChromaDB, configure authentication
# Add to ChromaDB config:
CHROMA_SERVER_AUTH_CREDENTIALS_FILE=/path/to/credentials
CHROMA_SERVER_AUTH_CREDENTIALS_PROVIDER=chromadb.auth.basic_authn.BasicAuthCredentialsProvider
```

### 3. Network Security
- Ensure ChromaDB is not exposed to public internet
- Use firewall rules to restrict access
- Consider VPN access for remote administration

## 📊 Production Configuration

### 1. Performance Tuning

Update `config.js` for production:

```javascript
const config = {
  // Vector Database - Production Settings
  vectorDB: {
    chromaUrl: process.env.CHROMA_URL || 'http://localhost:8000',
    collection: 'dogpatch-knowledge-prod',
    persistDirectory: '/data/chroma',
  },

  // Knowledge Gap Detection - Optimized
  knowledgeGap: {
    confidenceThreshold: 0.75, // Higher threshold for production
    similarityThreshold: 0.8,  // More strict similarity
    maxRetrievedDocs: 3,       // Fewer docs for faster response
  },

  // Logging - Production Settings
  logging: {
    level: 'info',
    logDirectory: '/var/log/rag-improver',
    enableFileLogging: true,
    enableDatabaseLogging: true,
    maxLogFiles: 30,
  },

  // Safety - Enhanced for Production
  safety: {
    rateLimit: {
      queriesPerMinute: 30,    // More conservative rate limiting
      updatesPerHour: 5,       // Limited updates per hour
    },
  },
};
```

### 2. Resource Monitoring

Set up monitoring for:
- Memory usage
- Query response times
- Vector database performance
- Error rates
- Knowledge gap detection rates

### 3. Backup Strategy

```bash
# Set up automated backups
crontab -e

# Add backup job (daily at 2 AM)
0 2 * * * /path/to/backup-script.sh
```

Create `backup-script.sh`:
```bash
#!/bin/bash
BACKUP_DIR="/backups/rag-improver/$(date +%Y-%m-%d)"
mkdir -p "$BACKUP_DIR"

# Backup vector database
curl -X POST http://localhost:8000/api/v1/collections/dogpatch-knowledge-prod/backup \
  -o "$BACKUP_DIR/vector-db-backup.json"

# Backup logs and configuration
cp -r /var/log/rag-improver "$BACKUP_DIR/logs"
cp /path/to/rag-improver/.env "$BACKUP_DIR/config.env"

# Compress backup
tar -czf "$BACKUP_DIR.tar.gz" "$BACKUP_DIR"
rm -rf "$BACKUP_DIR"

# Keep only last 30 days of backups
find /backups/rag-improver -name "*.tar.gz" -mtime +30 -delete
```

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

## 📈 Monitoring & Maintenance

### 1. Health Checks

Create a health check script `health-check.sh`:
```bash
#!/bin/bash

# Check ChromaDB
curl -f http://localhost:8000/api/v1/heartbeat || exit 1

# Check system status
cd /path/to/rag-improver
node -e "
const { getRAGEngine } = require('./index');
getRAGEngine().then(engine => engine.getStatistics())
  .then(stats => {
    console.log('System healthy:', stats.vectorDatabase.totalDocuments, 'documents');
    process.exit(0);
  })
  .catch(err => {
    console.error('Health check failed:', err);
    process.exit(1);
  });
"
```

### 2. Log Rotation

Set up log rotation in `/etc/logrotate.d/rag-improver`:
```
/var/log/rag-improver/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0644 librechat librechat
}
```

### 3. Performance Monitoring

Monitor these metrics:
- Query response time (target: <2s)
- Knowledge gap detection rate (baseline: ~15%)
- Expert workflow success rate (target: >80%)
- System uptime (target: 99.5%)

## 🚨 Troubleshooting

### Common Issues

1. **ChromaDB Connection Refused**
   ```bash
   # Check if ChromaDB is running
   docker ps | grep chroma
   
   # Restart if needed
   docker restart chroma-db
   ```

2. **OpenAI API Rate Limits**
   ```bash
   # Check current usage
   curl -H "Authorization: Bearer $OPENAI_API_KEY" \
        https://api.openai.com/v1/usage
   ```

3. **Memory Issues**
   ```bash
   # Monitor memory usage
   htop
   
   # Check Node.js memory
   node --max-old-space-size=4096 setup.js
   ```

4. **Knowledge Gaps Not Detected**
   - Check confidence thresholds in config
   - Verify sample queries work
   - Review gap detection logs

### Emergency Procedures

1. **System Unresponsive**
   ```bash
   # Restart ChromaDB
   docker restart chroma-db
   
   # Restart LibreChat
   pm2 restart librechat
   ```

2. **Data Corruption**
   ```bash
   # Restore from backup
   tar -xzf /backups/rag-improver/latest.tar.gz
   # Follow restoration procedure
   ```

## 📞 Support Contacts

### Internal Support
- **System Administrator**: admin@dogpatchlabs.com
- **IT Support**: it@dogpatchlabs.com
- **Emergency Contact**: +353 86 XXX XXXX

### External Support
- **LibreChat Community**: https://github.com/danny-avila/LibreChat
- **ChromaDB Documentation**: https://docs.trychroma.com/
- **OpenAI Support**: https://help.openai.com/

## 🎯 Success Metrics

After deployment, monitor these KPIs:

### User Satisfaction
- **Query Resolution Rate**: >85% of queries answered satisfactorily
- **Response Time**: <2 seconds average
- **User Adoption**: Track daily active users

### System Performance
- **Knowledge Gap Detection**: 10-20% of queries (indicates good coverage)
- **Expert Workflow Success**: >80% successful expert contacts
- **Knowledge Base Growth**: Regular additions from expert responses

### Business Impact
- **Reduced Support Tickets**: Measure decrease in HR/IT support requests
- **Time Saved**: Calculate time saved by employees finding answers quickly
- **Knowledge Retention**: Track improvement in company knowledge accessibility

---

## ✅ Deployment Checklist

- [ ] Node.js and dependencies installed
- [ ] ChromaDB running and accessible
- [ ] Environment variables configured
- [ ] Setup script completed successfully
- [ ] All tests passing
- [ ] LibreChat integration verified
- [ ] Backup strategy implemented
- [ ] Monitoring configured
- [ ] Health checks working
- [ ] Emergency procedures documented
- [ ] Team trained on system usage
- [ ] Go-live approved

**Deployment Status**: Ready for Production 🚀

---

*For questions about this deployment, contact the LibreChat RAG development team.*
