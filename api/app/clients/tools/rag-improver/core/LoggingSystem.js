const { logger } = require('@librechat/data-schemas');
const fs = require('fs-extra');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');

/**
 * Comprehensive Logging System for RAG Improver
 * Handles query logs, performance metrics, error tracking, and audit trails
 */
class LoggingSystem {
  constructor(config) {
    this.config = config.logging;
    this.db = null;
    this.queryLogs = [];
    this.performanceMetrics = [];
    this.errorLogs = [];
    this.auditTrail = [];
    this.isInitialized = false;
  }

  /**
   * Initialize the logging system
   */
  async initialize() {
    try {
      logger.info('Initializing Logging System...');

      // Ensure log directory exists
      await fs.ensureDir(this.config.logDirectory);

      // Initialize SQLite database for structured logging
      if (this.config.enableDatabaseLogging) {
        await this.initializeDatabase();
      }

      // Set up log rotation
      await this.setupLogRotation();

      this.isInitialized = true;
      logger.info('Logging System initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Logging System:', error);
      throw error;
    }
  }

  /**
   * Initialize SQLite database for logging
   */
  async initializeDatabase() {
    try {
      const dbPath = path.join(this.config.logDirectory, 'rag_logs.db');
      
      this.db = new sqlite3.Database(dbPath);

      // Create tables if they don't exist
      await this.createTables();

      logger.info('Database logging initialized');
    } catch (error) {
      logger.error('Failed to initialize database logging:', error);
      throw error;
    }
  }

  /**
   * Create database tables
   */
  async createTables() {
    return new Promise((resolve, reject) => {
      const tables = [
        // Query logs table
        `CREATE TABLE IF NOT EXISTS query_logs (
          id TEXT PRIMARY KEY,
          query TEXT NOT NULL,
          response TEXT,
          confidence REAL,
          retrieved_docs INTEGER,
          processing_time INTEGER,
          user_id TEXT,
          conversation_id TEXT,
          has_knowledge_gap BOOLEAN,
          gap_type TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          metadata TEXT
        )`,
        
        // Performance metrics table
        `CREATE TABLE IF NOT EXISTS performance_metrics (
          id TEXT PRIMARY KEY,
          operation TEXT NOT NULL,
          duration INTEGER,
          success BOOLEAN,
          error_message TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          metadata TEXT
        )`,
        
        // Error logs table
        `CREATE TABLE IF NOT EXISTS error_logs (
          id TEXT PRIMARY KEY,
          error_type TEXT NOT NULL,
          error_message TEXT,
          stack_trace TEXT,
          context TEXT,
          severity TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Audit trail table
        `CREATE TABLE IF NOT EXISTS audit_trail (
          id TEXT PRIMARY KEY,
          action TEXT NOT NULL,
          user_id TEXT,
          resource_type TEXT,
          resource_id TEXT,
          old_value TEXT,
          new_value TEXT,
          ip_address TEXT,
          user_agent TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Knowledge gap analysis table
        `CREATE TABLE IF NOT EXISTS knowledge_gaps (
          id TEXT PRIMARY KEY,
          query TEXT NOT NULL,
          gap_type TEXT,
          confidence REAL,
          missing_info TEXT,
          suggested_queries TEXT,
          expert_contact_needed BOOLEAN,
          workflow_triggered BOOLEAN,
          workflow_id TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Update logs table
        `CREATE TABLE IF NOT EXISTS update_logs (
          id TEXT PRIMARY KEY,
          update_type TEXT NOT NULL,
          source TEXT,
          documents_added INTEGER,
          documents_updated INTEGER,
          documents_deleted INTEGER,
          success BOOLEAN,
          error_message TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          metadata TEXT
        )`
      ];

      let completed = 0;
      tables.forEach(tableSQL => {
        this.db.run(tableSQL, (err) => {
          if (err) {
            reject(err);
            return;
          }
          completed++;
          if (completed === tables.length) {
            resolve();
          }
        });
      });
    });
  }

  /**
   * Log a query and its results
   * @param {Object} queryData - Query data to log
   */
  async logQuery(queryData) {
    try {
      const logEntry = {
        id: uuidv4(),
        query: queryData.query,
        response: queryData.response,
        confidence: queryData.confidence,
        retrieved_docs: queryData.sources?.length || 0,
        processing_time: queryData.metadata?.processingTime,
        user_id: queryData.metadata?.userId,
        conversation_id: queryData.metadata?.conversationId,
        has_knowledge_gap: queryData.knowledgeGap?.hasGap || false,
        gap_type: queryData.knowledgeGap?.gapType,
        timestamp: new Date().toISOString(),
        metadata: JSON.stringify(queryData.metadata || {}),
      };

      // Add to in-memory cache
      this.queryLogs.push(logEntry);
      this.trimCache(this.queryLogs, 1000);

      // Log to database if enabled
      if (this.config.enableDatabaseLogging && this.db) {
        await this.insertQueryLog(logEntry);
      }

      // Log to file if enabled
      if (this.config.enableFileLogging) {
        await this.writeFileLog('queries', logEntry);
      }

      logger.debug(`Query logged: ${queryData.query.substring(0, 50)}...`);
    } catch (error) {
      logger.error('Failed to log query:', error);
    }
  }

  /**
   * Log knowledge gap analysis
   * @param {Object} gapData - Knowledge gap data
   */
  async logKnowledgeGap(gapData) {
    try {
      const logEntry = {
        id: uuidv4(),
        query: gapData.query,
        gap_type: gapData.gapType,
        confidence: gapData.confidence,
        missing_info: gapData.missingInfo,
        suggested_queries: JSON.stringify(gapData.suggestedQueries || []),
        expert_contact_needed: gapData.expertContactNeeded,
        workflow_triggered: gapData.workflowTriggered || false,
        workflow_id: gapData.workflowId,
        timestamp: new Date().toISOString(),
      };

      // Log to database if enabled
      if (this.config.enableDatabaseLogging && this.db) {
        await this.insertKnowledgeGapLog(logEntry);
      }

      // Log to file if enabled
      if (this.config.enableFileLogging) {
        await this.writeFileLog('knowledge_gaps', logEntry);
      }

      logger.debug(`Knowledge gap logged: ${gapData.gapType}`);
    } catch (error) {
      logger.error('Failed to log knowledge gap:', error);
    }
  }

  /**
   * Log performance metrics
   * @param {Object} metricData - Performance metric data
   */
  async logPerformance(metricData) {
    try {
      const logEntry = {
        id: uuidv4(),
        operation: metricData.operation,
        duration: metricData.duration,
        success: metricData.success,
        error_message: metricData.error,
        timestamp: new Date().toISOString(),
        metadata: JSON.stringify(metricData.metadata || {}),
      };

      // Add to in-memory cache
      this.performanceMetrics.push(logEntry);
      this.trimCache(this.performanceMetrics, 500);

      // Log to database if enabled
      if (this.config.enableDatabaseLogging && this.db) {
        await this.insertPerformanceLog(logEntry);
      }

      // Log to file if enabled
      if (this.config.enableFileLogging) {
        await this.writeFileLog('performance', logEntry);
      }

      logger.debug(`Performance logged: ${metricData.operation} - ${metricData.duration}ms`);
    } catch (error) {
      logger.error('Failed to log performance:', error);
    }
  }

  /**
   * Log errors with context
   * @param {Object} errorData - Error data
   */
  async logError(errorData) {
    try {
      const logEntry = {
        id: uuidv4(),
        error_type: errorData.type || 'unknown',
        error_message: errorData.message,
        stack_trace: errorData.stack,
        context: JSON.stringify(errorData.context || {}),
        severity: errorData.severity || 'error',
        timestamp: new Date().toISOString(),
      };

      // Add to in-memory cache
      this.errorLogs.push(logEntry);
      this.trimCache(this.errorLogs, 500);

      // Log to database if enabled
      if (this.config.enableDatabaseLogging && this.db) {
        await this.insertErrorLog(logEntry);
      }

      // Log to file if enabled
      if (this.config.enableFileLogging) {
        await this.writeFileLog('errors', logEntry);
      }

      logger.error(`Error logged: ${errorData.type} - ${errorData.message}`);
    } catch (error) {
      logger.error('Failed to log error:', error);
    }
  }

  /**
   * Log audit trail events
   * @param {Object} auditData - Audit data
   */
  async logAudit(auditData) {
    try {
      const logEntry = {
        id: uuidv4(),
        action: auditData.action,
        user_id: auditData.userId,
        resource_type: auditData.resourceType,
        resource_id: auditData.resourceId,
        old_value: JSON.stringify(auditData.oldValue || {}),
        new_value: JSON.stringify(auditData.newValue || {}),
        ip_address: auditData.ipAddress,
        user_agent: auditData.userAgent,
        timestamp: new Date().toISOString(),
      };

      // Add to in-memory cache
      this.auditTrail.push(logEntry);
      this.trimCache(this.auditTrail, 500);

      // Log to database if enabled
      if (this.config.enableDatabaseLogging && this.db) {
        await this.insertAuditLog(logEntry);
      }

      // Log to file if enabled
      if (this.config.enableFileLogging) {
        await this.writeFileLog('audit', logEntry);
      }

      logger.debug(`Audit logged: ${auditData.action} by ${auditData.userId}`);
    } catch (error) {
      logger.error('Failed to log audit event:', error);
    }
  }

  /**
   * Log knowledge base updates
   * @param {Object} updateData - Update data
   */
  async logUpdate(updateData) {
    try {
      const logEntry = {
        id: uuidv4(),
        update_type: updateData.type,
        source: updateData.source,
        documents_added: updateData.documentsAdded || 0,
        documents_updated: updateData.documentsUpdated || 0,
        documents_deleted: updateData.documentsDeleted || 0,
        success: updateData.success,
        error_message: updateData.error,
        timestamp: new Date().toISOString(),
        metadata: JSON.stringify(updateData.metadata || {}),
      };

      // Log to database if enabled
      if (this.config.enableDatabaseLogging && this.db) {
        await this.insertUpdateLog(logEntry);
      }

      // Log to file if enabled
      if (this.config.enableFileLogging) {
        await this.writeFileLog('updates', logEntry);
      }

      logger.info(`Update logged: ${updateData.type} - ${updateData.success ? 'success' : 'failed'}`);
    } catch (error) {
      logger.error('Failed to log update:', error);
    }
  }

  /**
   * Insert query log into database
   * @param {Object} logEntry - Log entry
   */
  async insertQueryLog(logEntry) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO query_logs (
        id, query, response, confidence, retrieved_docs, processing_time,
        user_id, conversation_id, has_knowledge_gap, gap_type, timestamp, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      this.db.run(sql, [
        logEntry.id, logEntry.query, logEntry.response, logEntry.confidence,
        logEntry.retrieved_docs, logEntry.processing_time, logEntry.user_id,
        logEntry.conversation_id, logEntry.has_knowledge_gap, logEntry.gap_type,
        logEntry.timestamp, logEntry.metadata
      ], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Insert knowledge gap log into database
   * @param {Object} logEntry - Log entry
   */
  async insertKnowledgeGapLog(logEntry) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO knowledge_gaps (
        id, query, gap_type, confidence, missing_info, suggested_queries,
        expert_contact_needed, workflow_triggered, workflow_id, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      this.db.run(sql, [
        logEntry.id, logEntry.query, logEntry.gap_type, logEntry.confidence,
        logEntry.missing_info, logEntry.suggested_queries, logEntry.expert_contact_needed,
        logEntry.workflow_triggered, logEntry.workflow_id, logEntry.timestamp
      ], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Insert performance log into database
   * @param {Object} logEntry - Log entry
   */
  async insertPerformanceLog(logEntry) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO performance_metrics (
        id, operation, duration, success, error_message, timestamp, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`;

      this.db.run(sql, [
        logEntry.id, logEntry.operation, logEntry.duration, logEntry.success,
        logEntry.error_message, logEntry.timestamp, logEntry.metadata
      ], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Insert error log into database
   * @param {Object} logEntry - Log entry
   */
  async insertErrorLog(logEntry) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO error_logs (
        id, error_type, error_message, stack_trace, context, severity, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`;

      this.db.run(sql, [
        logEntry.id, logEntry.error_type, logEntry.error_message, logEntry.stack_trace,
        logEntry.context, logEntry.severity, logEntry.timestamp
      ], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Insert audit log into database
   * @param {Object} logEntry - Log entry
   */
  async insertAuditLog(logEntry) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO audit_trail (
        id, action, user_id, resource_type, resource_id, old_value,
        new_value, ip_address, user_agent, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      this.db.run(sql, [
        logEntry.id, logEntry.action, logEntry.user_id, logEntry.resource_type,
        logEntry.resource_id, logEntry.old_value, logEntry.new_value,
        logEntry.ip_address, logEntry.user_agent, logEntry.timestamp
      ], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Insert update log into database
   * @param {Object} logEntry - Log entry
   */
  async insertUpdateLog(logEntry) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO update_logs (
        id, update_type, source, documents_added, documents_updated,
        documents_deleted, success, error_message, timestamp, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      this.db.run(sql, [
        logEntry.id, logEntry.update_type, logEntry.source, logEntry.documents_added,
        logEntry.documents_updated, logEntry.documents_deleted, logEntry.success,
        logEntry.error_message, logEntry.timestamp, logEntry.metadata
      ], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Write log entry to file
   * @param {string} logType - Type of log
   * @param {Object} logEntry - Log entry
   */
  async writeFileLog(logType, logEntry) {
    try {
      const logFile = path.join(this.config.logDirectory, `${logType}.jsonl`);
      await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');
    } catch (error) {
      logger.error(`Failed to write ${logType} log to file:`, error);
    }
  }

  /**
   * Trim in-memory cache to prevent memory leaks
   * @param {Array} cache - Cache array
   * @param {number} maxSize - Maximum size
   */
  trimCache(cache, maxSize) {
    while (cache.length > maxSize) {
      cache.shift();
    }
  }

  /**
   * Set up log rotation
   */
  async setupLogRotation() {
    try {
      // Create a rotation schedule (simplified version)
      setInterval(async () => {
        await this.rotateLogFiles();
      }, 24 * 60 * 60 * 1000); // Daily rotation

      logger.debug('Log rotation scheduled');
    } catch (error) {
      logger.error('Failed to setup log rotation:', error);
    }
  }

  /**
   * Rotate log files
   */
  async rotateLogFiles() {
    try {
      const logFiles = ['queries.jsonl', 'performance.jsonl', 'errors.jsonl', 'audit.jsonl'];
      const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      for (const logFile of logFiles) {
        const currentPath = path.join(this.config.logDirectory, logFile);
        const archivePath = path.join(this.config.logDirectory, `${timestamp}_${logFile}`);

        if (await fs.pathExists(currentPath)) {
          await fs.move(currentPath, archivePath);
        }
      }

      // Clean up old log files
      await this.cleanupOldLogs();

      logger.info('Log files rotated successfully');
    } catch (error) {
      logger.error('Failed to rotate log files:', error);
    }
  }

  /**
   * Clean up old log files
   */
  async cleanupOldLogs() {
    try {
      const files = await fs.readdir(this.config.logDirectory);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.maxLogFiles);

      for (const file of files) {
        const filePath = path.join(this.config.logDirectory, file);
        const stats = await fs.stat(filePath);

        if (stats.birthtime < cutoffDate && file.endsWith('.jsonl')) {
          await fs.remove(filePath);
          logger.debug(`Removed old log file: ${file}`);
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup old logs:', error);
    }
  }

  /**
   * Get comprehensive statistics
   * @returns {Object} - Logging statistics
   */
  async getStatistics() {
    try {
      const stats = {
        queryLogs: this.queryLogs.length,
        performanceMetrics: this.performanceMetrics.length,
        errorLogs: this.errorLogs.length,
        auditTrail: this.auditTrail.length,
      };

      // Add database statistics if available
      if (this.config.enableDatabaseLogging && this.db) {
        stats.database = await this.getDatabaseStatistics();
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get logging statistics:', error);
      return { error: 'Failed to get statistics' };
    }
  }

  /**
   * Get database statistics
   * @returns {Promise<Object>} - Database statistics
   */
  async getDatabaseStatistics() {
    return new Promise((resolve, reject) => {
      const stats = {};
      const tables = ['query_logs', 'performance_metrics', 'error_logs', 'audit_trail', 'knowledge_gaps', 'update_logs'];
      let completed = 0;

      tables.forEach(table => {
        this.db.get(`SELECT COUNT(*) as count FROM ${table}`, (err, row) => {
          if (err) {
            stats[table] = 'error';
          } else {
            stats[table] = row.count;
          }
          
          completed++;
          if (completed === tables.length) {
            resolve(stats);
          }
        });
      });
    });
  }

  /**
   * Close the logging system
   */
  async close() {
    if (this.db) {
      this.db.close();
    }
    
    this.queryLogs = [];
    this.performanceMetrics = [];
    this.errorLogs = [];
    this.auditTrail = [];
    this.isInitialized = false;
    
    logger.info('Logging System closed');
  }
}

module.exports = LoggingSystem;
