const { logger } = require('@librechat/data-schemas');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

/**
 * Knowledge Base Updater
 * Handles updating the knowledge base with new information and validation
 */
class KnowledgeUpdater {
  constructor(config, vectorDB, documentProcessor) {
    this.config = config;
    this.vectorDB = vectorDB;
    this.documentProcessor = documentProcessor;
    this.updateQueue = [];
    this.updateHistory = [];
    this.isInitialized = false;
  }

  /**
   * Initialize the knowledge updater
   */
  async initialize() {
    try {
      logger.info('Initializing Knowledge Updater...');

      // Ensure directories exist
      await fs.ensureDir(this.config.knowledgeUpdate.backupDirectory);
      await fs.ensureDir(path.dirname(this.config.knowledgeUpdate.updateLogFile));

      // Load existing update history
      await this.loadUpdateHistory();

      this.isInitialized = true;
      logger.info('Knowledge Updater initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Knowledge Updater:', error);
      throw error;
    }
  }

  /**
   * Update knowledge base with processed information
   * @param {Object} processedInfo - Processed information from expert response
   * @param {Object} options - Update options
   * @returns {Promise<Object>} - Update result
   */
  async updateKnowledgeBase(processedInfo, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      logger.info(`Updating knowledge base with processed info: ${processedInfo.id}`);

      const updateId = uuidv4();
      const update = {
        id: updateId,
        processedInfoId: processedInfo.id,
        type: 'expert_response',
        status: 'initiated',
        requestedAt: new Date().toISOString(),
        options: options,
        steps: [],
      };

      this.updateQueue.push(update);
      this.addUpdateStep(update, 'validation', 'in_progress');

      // Step 1: Validate the update
      const validationResult = await this.validateUpdate(processedInfo, options);
      if (!validationResult.isValid) {
        this.addUpdateStep(update, 'validation', 'failed', validationResult.errors.join(', '));
        update.status = 'validation_failed';
        return {
          success: false,
          updateId: updateId,
          error: 'Validation failed',
          details: validationResult.errors,
        };
      }

      this.addUpdateStep(update, 'validation', 'completed', 'Validation passed');

      // Step 2: Check if human approval is required
      if (this.config.knowledgeUpdate.requireHumanApproval && !options.approved) {
        this.addUpdateStep(update, 'human_approval', 'pending');
        update.status = 'awaiting_approval';
        
        await this.requestHumanApproval(update, processedInfo);
        
        return {
          success: true,
          updateId: updateId,
          status: 'awaiting_approval',
          message: 'Update is pending human approval',
          approvalRequired: true,
        };
      }

      // Step 3: Create backup if enabled
      if (this.config.knowledgeUpdate.backupEnabled) {
        this.addUpdateStep(update, 'backup', 'in_progress');
        
        const backupResult = await this.createBackup(updateId);
        if (!backupResult.success) {
          this.addUpdateStep(update, 'backup', 'failed', backupResult.error);
          update.status = 'backup_failed';
          return {
            success: false,
            updateId: updateId,
            error: 'Backup failed',
            details: backupResult.error,
          };
        }
        
        this.addUpdateStep(update, 'backup', 'completed', `Backup created: ${backupResult.backupPath}`);
        update.backupPath = backupResult.backupPath;
      }

      // Step 4: Handle conflicts if any
      if (processedInfo.conflictAnalysis.hasConflicts) {
        this.addUpdateStep(update, 'conflict_resolution', 'in_progress');
        
        const resolutionResult = await this.resolveConflicts(processedInfo, options);
        if (!resolutionResult.success) {
          this.addUpdateStep(update, 'conflict_resolution', 'failed', resolutionResult.error);
          update.status = 'conflict_resolution_failed';
          return {
            success: false,
            updateId: updateId,
            error: 'Conflict resolution failed',
            details: resolutionResult.error,
          };
        }
        
        this.addUpdateStep(update, 'conflict_resolution', 'completed', resolutionResult.resolution);
        update.conflictResolution = resolutionResult;
      }

      // Step 5: Add documents to vector database
      this.addUpdateStep(update, 'vector_db_update', 'in_progress');
      
      const vectorUpdateResult = await this.updateVectorDatabase(processedInfo.documentChunks);
      if (!vectorUpdateResult.success) {
        this.addUpdateStep(update, 'vector_db_update', 'failed', vectorUpdateResult.error);
        update.status = 'vector_db_failed';
        return {
          success: false,
          updateId: updateId,
          error: 'Vector database update failed',
          details: vectorUpdateResult.error,
        };
      }
      
      this.addUpdateStep(update, 'vector_db_update', 'completed', 
        `Added ${vectorUpdateResult.addedDocuments} documents`);
      update.addedDocuments = vectorUpdateResult.addedDocuments;
      update.documentIds = vectorUpdateResult.documentIds;

      // Step 6: Update metadata and logs
      this.addUpdateStep(update, 'metadata_update', 'in_progress');
      
      await this.updateMetadata(update, processedInfo);
      this.addUpdateStep(update, 'metadata_update', 'completed');

      // Mark update as completed
      update.status = 'completed';
      update.completedAt = new Date().toISOString();

      // Remove from queue and add to history
      this.updateQueue = this.updateQueue.filter(u => u.id !== updateId);
      this.updateHistory.push(update);

      // Save update log
      await this.saveUpdateLog(update);

      logger.info(`Successfully updated knowledge base: ${updateId}`);
      
      return {
        success: true,
        updateId: updateId,
        status: 'completed',
        documentsAdded: update.addedDocuments,
        documentIds: update.documentIds,
        backupPath: update.backupPath,
        message: 'Knowledge base updated successfully',
      };
    } catch (error) {
      logger.error(`Failed to update knowledge base for ${processedInfo.id}:`, error);
      
      // Mark update as failed
      if (this.updateQueue.length > 0) {
        const update = this.updateQueue[this.updateQueue.length - 1];
        update.status = 'error';
        update.error = error.message;
        this.addUpdateStep(update, 'error', 'failed', error.message);
      }
      
      return {
        success: false,
        error: error.message,
        message: 'Knowledge base update failed',
      };
    }
  }

  /**
   * Validate update before processing
   * @param {Object} processedInfo - Processed information
   * @param {Object} options - Update options
   * @returns {Promise<Object>} - Validation result
   */
  async validateUpdate(processedInfo, options) {
    try {
      const errors = [];
      const warnings = [];

      // Check if processed info is valid
      if (!processedInfo || !processedInfo.success) {
        errors.push('Processed information is invalid or unsuccessful');
      }

      // Check if document chunks exist
      if (!processedInfo.documentChunks || processedInfo.documentChunks.length === 0) {
        errors.push('No document chunks available for update');
      }

      // Check extraction quality
      if (processedInfo.extraction && processedInfo.extraction.structuredInfo) {
        const confidence = processedInfo.extraction.structuredInfo.confidence;
        if (confidence < 0.5) {
          warnings.push(`Low confidence level: ${confidence}`);
        }
        if (confidence < 0.3) {
          errors.push(`Confidence level too low for automatic update: ${confidence}`);
        }
      }

      // Check for validation issues in processed info
      if (processedInfo.validation && !processedInfo.validation.isValid) {
        errors.push(`Validation issues: ${processedInfo.validation.errors.join(', ')}`);
      }

      // Check rate limits
      const recentUpdates = this.updateHistory.filter(update => {
        const updateTime = new Date(update.completedAt || update.requestedAt);
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        return updateTime > oneHourAgo;
      });

      if (recentUpdates.length >= this.config.safety.rateLimit.updatesPerHour) {
        errors.push('Rate limit exceeded: too many updates in the last hour');
      }

      return {
        isValid: errors.length === 0,
        errors: errors,
        warnings: warnings,
      };
    } catch (error) {
      logger.error('Validation error:', error);
      return {
        isValid: false,
        errors: ['Validation process failed'],
      };
    }
  }

  /**
   * Create backup before update
   * @param {string} updateId - Update ID
   * @returns {Promise<Object>} - Backup result
   */
  async createBackup(updateId) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(
        this.config.knowledgeUpdate.backupDirectory,
        `backup_${updateId}_${timestamp}.json`
      );

      await this.vectorDB.backup(backupPath);

      return {
        success: true,
        backupPath: backupPath,
      };
    } catch (error) {
      logger.error('Backup creation failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Resolve conflicts with existing knowledge
   * @param {Object} processedInfo - Processed information
   * @param {Object} options - Update options
   * @returns {Promise<Object>} - Resolution result
   */
  async resolveConflicts(processedInfo, options) {
    try {
      const conflictAnalysis = processedInfo.conflictAnalysis;
      
      switch (this.config.knowledgeUpdate.conflictResolution) {
        case 'auto_merge':
          return await this.autoMergeConflicts(processedInfo, conflictAnalysis);
        
        case 'human_review':
          return await this.escalateToHumanReview(processedInfo, conflictAnalysis);
        
        case 'create_new':
          return await this.createNewDocument(processedInfo);
        
        default:
          throw new Error(`Unknown conflict resolution strategy: ${this.config.knowledgeUpdate.conflictResolution}`);
      }
    } catch (error) {
      logger.error('Conflict resolution failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Auto-merge conflicts
   * @param {Object} processedInfo - Processed information
   * @param {Object} conflictAnalysis - Conflict analysis
   * @returns {Promise<Object>} - Merge result
   */
  async autoMergeConflicts(processedInfo, conflictAnalysis) {
    // For now, just create new document
    // In a full implementation, this would intelligently merge content
    return await this.createNewDocument(processedInfo);
  }

  /**
   * Escalate to human review
   * @param {Object} processedInfo - Processed information
   * @param {Object} conflictAnalysis - Conflict analysis
   * @returns {Promise<Object>} - Escalation result
   */
  async escalateToHumanReview(processedInfo, conflictAnalysis) {
    // Log conflict for human review
    const conflictLog = {
      id: uuidv4(),
      processedInfoId: processedInfo.id,
      conflictAnalysis: conflictAnalysis,
      status: 'pending_review',
      createdAt: new Date().toISOString(),
    };

    const conflictLogPath = path.join(
      this.config.logging.logDirectory,
      'conflicts.jsonl'
    );

    await fs.appendFile(conflictLogPath, JSON.stringify(conflictLog) + '\n');

    return {
      success: true,
      resolution: 'escalated_to_human_review',
      conflictId: conflictLog.id,
    };
  }

  /**
   * Create new document instead of updating existing
   * @param {Object} processedInfo - Processed information
   * @returns {Promise<Object>} - Creation result
   */
  async createNewDocument(processedInfo) {
    // Add metadata to indicate this is a new version
    processedInfo.documentChunks.forEach(chunk => {
      chunk.metadata.version = 'new';
      chunk.metadata.creation_reason = 'conflict_resolution';
    });

    return {
      success: true,
      resolution: 'created_new_document',
    };
  }

  /**
   * Update vector database with new documents
   * @param {Array} documentChunks - Document chunks to add
   * @returns {Promise<Object>} - Update result
   */
  async updateVectorDatabase(documentChunks) {
    try {
      const documentIds = await this.vectorDB.addDocuments(documentChunks);

      return {
        success: true,
        addedDocuments: documentChunks.length,
        documentIds: documentIds,
      };
    } catch (error) {
      logger.error('Vector database update failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Update metadata and search indices
   * @param {Object} update - Update object
   * @param {Object} processedInfo - Processed information
   */
  async updateMetadata(update, processedInfo) {
    try {
      // Update search metadata, category indices, etc.
      // For now, just log the metadata update
      logger.debug(`Updating metadata for update ${update.id}`);
      
      // In a full implementation, this would:
      // 1. Update category indices
      // 2. Update keyword mappings
      // 3. Update expert contact mappings
      // 4. Refresh search caches
    } catch (error) {
      logger.error('Metadata update failed:', error);
      throw error;
    }
  }

  /**
   * Request human approval for update
   * @param {Object} update - Update object
   * @param {Object} processedInfo - Processed information
   */
  async requestHumanApproval(update, processedInfo) {
    try {
      const approvalRequest = {
        updateId: update.id,
        processedInfoId: processedInfo.id,
        summary: processedInfo.extraction.structuredInfo.summary,
        category: processedInfo.extraction.structuredInfo.category,
        confidence: processedInfo.extraction.structuredInfo.confidence,
        documentCount: processedInfo.documentChunks.length,
        hasConflicts: processedInfo.conflictAnalysis.hasConflicts,
        requestedAt: new Date().toISOString(),
        status: 'pending',
      };

      // Save approval request
      const approvalPath = path.join(
        this.config.logging.logDirectory,
        'approval_requests.jsonl'
      );

      await fs.appendFile(approvalPath, JSON.stringify(approvalRequest) + '\n');

      // TODO: Send notification to administrators
      logger.info(`Human approval requested for update ${update.id}`);
    } catch (error) {
      logger.error('Failed to request human approval:', error);
      throw error;
    }
  }

  /**
   * Approve a pending update
   * @param {string} updateId - Update ID
   * @param {Object} approvalOptions - Approval options
   * @returns {Promise<Object>} - Approval result
   */
  async approveUpdate(updateId, approvalOptions = {}) {
    try {
      const update = this.updateQueue.find(u => u.id === updateId);
      if (!update) {
        throw new Error(`Update ${updateId} not found in queue`);
      }

      if (update.status !== 'awaiting_approval') {
        throw new Error(`Update ${updateId} is not awaiting approval (status: ${update.status})`);
      }

      logger.info(`Approving update ${updateId}`);

      // Continue the update process with approval
      const processedInfo = await this.getProcessedInfo(update.processedInfoId);
      return await this.updateKnowledgeBase(processedInfo, { 
        ...update.options, 
        approved: true,
        approvalOptions: approvalOptions,
      });
    } catch (error) {
      logger.error(`Failed to approve update ${updateId}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Reject a pending update
   * @param {string} updateId - Update ID
   * @param {string} reason - Rejection reason
   * @returns {Promise<Object>} - Rejection result
   */
  async rejectUpdate(updateId, reason) {
    try {
      const update = this.updateQueue.find(u => u.id === updateId);
      if (!update) {
        throw new Error(`Update ${updateId} not found in queue`);
      }

      update.status = 'rejected';
      update.rejectionReason = reason;
      update.rejectedAt = new Date().toISOString();

      this.addUpdateStep(update, 'human_approval', 'rejected', reason);

      // Remove from queue and add to history
      this.updateQueue = this.updateQueue.filter(u => u.id !== updateId);
      this.updateHistory.push(update);

      await this.saveUpdateLog(update);

      logger.info(`Update ${updateId} rejected: ${reason}`);

      return {
        success: true,
        updateId: updateId,
        status: 'rejected',
        reason: reason,
      };
    } catch (error) {
      logger.error(`Failed to reject update ${updateId}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Add step to update process
   * @param {Object} update - Update object
   * @param {string} step - Step name
   * @param {string} status - Step status
   * @param {string} details - Step details
   */
  addUpdateStep(update, step, status, details = '') {
    update.steps.push({
      step: step,
      status: status,
      details: details,
      timestamp: new Date().toISOString(),
    });

    logger.debug(`Update ${update.id} - ${step}: ${status} - ${details}`);
  }

  /**
   * Save update log
   * @param {Object} update - Update object
   */
  async saveUpdateLog(update) {
    try {
      await fs.appendFile(
        this.config.knowledgeUpdate.updateLogFile,
        JSON.stringify(update) + '\n'
      );
    } catch (error) {
      logger.error('Failed to save update log:', error);
    }
  }

  /**
   * Load update history from log file
   */
  async loadUpdateHistory() {
    try {
      if (await fs.pathExists(this.config.knowledgeUpdate.updateLogFile)) {
        const logContent = await fs.readFile(this.config.knowledgeUpdate.updateLogFile, 'utf-8');
        const lines = logContent.trim().split('\n').filter(line => line.trim());
        
        this.updateHistory = lines.map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        }).filter(Boolean);

        logger.info(`Loaded ${this.updateHistory.length} update history entries`);
      }
    } catch (error) {
      logger.warn('Failed to load update history:', error.message);
      this.updateHistory = [];
    }
  }

  /**
   * Get processed information (placeholder for integration)
   * @param {string} processedInfoId - Processed info ID
   * @returns {Promise<Object>} - Processed information
   */
  async getProcessedInfo(processedInfoId) {
    // This would integrate with the InformationProcessor to retrieve processed info
    // For now, return a placeholder
    throw new Error('getProcessedInfo not implemented - requires integration with InformationProcessor');
  }

  /**
   * Get update statistics
   * @returns {Object} - Update statistics
   */
  getStatistics() {
    const stats = {
      pendingUpdates: this.updateQueue.length,
      completedUpdates: this.updateHistory.filter(u => u.status === 'completed').length,
      failedUpdates: this.updateHistory.filter(u => u.status === 'error').length,
      awaitingApproval: this.updateQueue.filter(u => u.status === 'awaiting_approval').length,
      recentUpdates: this.updateHistory.slice(-10),
    };

    return stats;
  }

  /**
   * Close the knowledge updater
   */
  async close() {
    this.updateQueue = [];
    this.updateHistory = [];
    this.isInitialized = false;
    logger.info('Knowledge Updater closed');
  }
}

module.exports = KnowledgeUpdater;
