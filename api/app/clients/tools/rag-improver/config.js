const path = require('path');
const { logger } = require('@librechat/data-schemas');

// Load environment variables from LibreChat root directory
require('dotenv').config({ path: path.join(__dirname, '../../../../../.env') });

/**
 * Configuration for the Self-Improving RAG System
 */
const config = {
  // Vector Database Configuration
  vectorDB: {
    type: 'chroma', // 'chroma' or 'pinecone'
    chromaUrl: process.env.CHROMA_URL || 'http://localhost:8001',
    collection: 'dogpatch-knowledge',
    persistDirectory: path.join(__dirname, 'data', 'chroma'),
  },

  // OpenAI Configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o-mini',
    embeddingModel: 'text-embedding-3-small',
    maxTokens: 4000,
    temperature: 0.1,
  },

  // Knowledge Gap Detection
  knowledgeGap: {
    confidenceThreshold: 0.7, // Below this, trigger knowledge gap detection
    similarityThreshold: 0.75, // Minimum similarity for relevant documents
    maxRetrievedDocs: 5, // Number of documents to retrieve for context
    gapDetectionPrompt: `
      Analyze the user's question and the retrieved context. Determine if there's sufficient information to provide a complete answer.
      
      Response format:
      {
        "hasGap": boolean,
        "confidence": number (0-1),
        "gapType": "no_documents" | "partial_info" | "outdated_info" | "unclear_question",
        "missingInfo": "description of what information is missing",
        "suggestedQueries": ["query1", "query2"],
        "expertContactNeeded": boolean
      }
    `,
  },

  // Agent Workflow System
  agentWorkflow: {
    enabled: true,
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
    emailSettings: {
      enabled: process.env.EMAIL_ENABLED === 'true',
      smtpHost: process.env.SMTP_HOST,
      smtpPort: process.env.SMTP_PORT || 587,
      smtpUser: process.env.SMTP_USER,
      smtpPass: process.env.SMTP_PASS,
    },
    escalationTimeout: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
    retryAttempts: 3,
  },

  // Knowledge Base Update
  knowledgeUpdate: {
    autoUpdateEnabled: true,
    requireHumanApproval: true,
    backupEnabled: true,
    backupDirectory: path.join(__dirname, 'data', 'backups'),
    updateLogFile: path.join(__dirname, 'data', 'logs', 'knowledge_updates.json'),
    conflictResolution: 'human_review', // 'auto_merge' | 'human_review' | 'create_new'
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    logDirectory: path.join(__dirname, 'data', 'logs'),
    enableFileLogging: true,
    enableDatabaseLogging: true,
    maxLogFiles: 30, // Keep logs for 30 days
    queryLogRetention: 90 * 24 * 60 * 60 * 1000, // 90 days
  },

  // Document Processing
  documentProcessing: {
    chunkSize: 1000,
    chunkOverlap: 200,
    supportedFormats: ['.pdf', '.docx', '.txt', '.md', '.json'],
    maxFileSize: 50 * 1024 * 1024, // 50MB
    processingTimeout: 5 * 60 * 1000, // 5 minutes
  },

  // Employee Directory (for contact identification)
  employeeDirectory: {
    enabled: true,
    apiUrl: process.env.EMPLOYEE_API_URL,
    apiKey: process.env.EMPLOYEE_API_KEY,
    defaultContacts: {
      hr: { name: 'HR Team', email: 'hr@dogpatchlabs.com', slack: '#hr' },
      it: { name: 'IT Support', email: 'it@dogpatchlabs.com', slack: '#it-support' },
      admin: { name: 'Admin Team', email: 'admin@dogpatchlabs.com', slack: '#admin' },
    },
  },

  // Safety and Security
  safety: {
    piiDetection: true,
    contentModeration: true,
    rateLimit: {
      queriesPerMinute: 60,
      updatesPerHour: 10,
    },
    allowedDomains: ['dogpatchlabs.com'],
    prohibitedPatterns: [
      /password/i,
      /secret/i,
      /confidential/i,
      /api[_-]?key/i,
    ],
  },
};

// Validate critical configuration
const validateConfig = () => {
  const errors = [];

  if (!config.openai.apiKey || config.openai.apiKey === 'your-openai-api-key') {
    errors.push('OpenAI API key is required');
  }

  if (config.vectorDB.type === 'chroma' && !config.vectorDB.chromaUrl) {
    errors.push('Chroma URL is required when using Chroma as vector database');
  }

  if (errors.length > 0) {
    logger.error('RAG Improver Configuration Errors:', errors);
    throw new Error('Invalid configuration: ' + errors.join(', '));
  }

  logger.info('RAG Improver configuration validated successfully');
};

module.exports = {
  config,
  validateConfig,
};
