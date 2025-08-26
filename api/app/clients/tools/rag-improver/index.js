const RAGEngine = require('./core/RAGEngine');
const { config, validateConfig } = require('./config');
const { logger } = require('@librechat/data-schemas');

/**
 * Self-Improving RAG System Entry Point
 * This module provides the main interface for the RAG system
 */

// Validate configuration on module load
try {
  validateConfig();
} catch (error) {
  logger.error('RAG Improver configuration validation failed:', error);
  process.exit(1);
}

/**
 * Create and initialize a new RAG engine instance
 * @returns {Promise<RAGEngine>} - Initialized RAG engine
 */
async function createRAGEngine() {
  const engine = new RAGEngine(config);
  await engine.initialize();
  return engine;
}

/**
 * Create a singleton RAG engine instance
 */
let ragEngineInstance = null;

async function getRAGEngine() {
  if (!ragEngineInstance) {
    ragEngineInstance = await createRAGEngine();
  }
  return ragEngineInstance;
}

/**
 * Graceful shutdown
 */
async function shutdown() {
  if (ragEngineInstance) {
    await ragEngineInstance.close();
    ragEngineInstance = null;
  }
  logger.info('RAG System shutdown complete');
}

// Handle process termination
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', shutdown);

module.exports = {
  RAGEngine,
  createRAGEngine,
  getRAGEngine,
  shutdown,
  config,
};
