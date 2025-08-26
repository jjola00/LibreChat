const { logger } = require('@librechat/data-schemas');
const ContactLocator = require('./ContactLocator');
const CommunicationManager = require('./CommunicationManager');
const InformationProcessor = require('./InformationProcessor');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

/**
 * Agent Workflow Manager
 * Orchestrates automated information gathering when knowledge gaps are detected
 */
class AgentWorkflowManager {
  constructor(config) {
    this.config = config;
    this.contactLocator = new ContactLocator(config);
    this.communicationManager = new CommunicationManager(config);
    this.informationProcessor = new InformationProcessor(config);
    
    this.activeWorkflows = new Map();
    this.workflowHistory = [];
    this.isInitialized = false;
  }

  /**
   * Initialize the agent workflow manager
   */
  async initialize() {
    try {
      logger.info('Initializing Agent Workflow Manager...');

      await this.contactLocator.initialize();
      await this.communicationManager.initialize();
      await this.informationProcessor.initialize();

      // Ensure workflow data directory exists
      await fs.ensureDir(path.join(this.config.logging.logDirectory, 'workflows'));

      this.isInitialized = true;
      logger.info('Agent Workflow Manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Agent Workflow Manager:', error);
      throw error;
    }
  }

  /**
   * Trigger a workflow based on knowledge gap analysis
   * @param {Object} gapAnalysis - Knowledge gap analysis result
   * @param {string} originalQuery - Original user query
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} - Workflow result
   */
  async triggerWorkflow(gapAnalysis, originalQuery, context = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      logger.info(`Triggering workflow for gap type: ${gapAnalysis.gapType}`);

      const workflowId = uuidv4();
      const workflow = {
        id: workflowId,
        query: originalQuery,
        gapAnalysis: gapAnalysis,
        context: context,
        status: 'initiated',
        steps: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      this.activeWorkflows.set(workflowId, workflow);

      // Determine workflow strategy based on gap type
      const strategy = this.determineWorkflowStrategy(gapAnalysis);
      workflow.strategy = strategy;

      logger.info(`Using strategy: ${strategy.type} for workflow ${workflowId}`);

      // Execute workflow based on strategy
      let result;
      switch (strategy.type) {
        case 'expert_contact':
          result = await this.executeExpertContactWorkflow(workflow);
          break;
        case 'document_search':
          result = await this.executeDocumentSearchWorkflow(workflow);
          break;
        case 'escalation':
          result = await this.executeEscalationWorkflow(workflow);
          break;
        case 'clarification':
          result = await this.executeClarificationWorkflow(workflow);
          break;
        default:
          result = await this.executeDefaultWorkflow(workflow);
      }

      // Update workflow status
      workflow.status = result.success ? 'completed' : 'failed';
      workflow.result = result;
      workflow.updatedAt = new Date().toISOString();

      // Archive workflow
      await this.archiveWorkflow(workflow);

      logger.info(`Workflow ${workflowId} completed with status: ${workflow.status}`);
      return result;
    } catch (error) {
      logger.error('Failed to execute workflow:', error);
      throw error;
    }
  }

  /**
   * Determine the appropriate workflow strategy
   * @param {Object} gapAnalysis - Knowledge gap analysis
   * @returns {Object} - Workflow strategy
   */
  determineWorkflowStrategy(gapAnalysis) {
    const { gapType, expertContactNeeded, confidence } = gapAnalysis;

    // High confidence expert contact needed
    if (expertContactNeeded && confidence > 0.8) {
      return {
        type: 'expert_contact',
        priority: 'high',
        timeout: 2 * 60 * 60 * 1000, // 2 hours
      };
    }

    // No documents found - try broader search or contact
    if (gapType === 'no_documents') {
      return {
        type: 'document_search',
        priority: 'medium',
        timeout: 30 * 60 * 1000, // 30 minutes
        fallback: 'expert_contact',
      };
    }

    // Outdated information - contact for updates
    if (gapType === 'outdated_info') {
      return {
        type: 'expert_contact',
        priority: 'medium',
        timeout: 4 * 60 * 60 * 1000, // 4 hours
        updateFocus: true,
      };
    }

    // Unclear question - seek clarification
    if (gapType === 'unclear_question') {
      return {
        type: 'clarification',
        priority: 'low',
        timeout: 1 * 60 * 60 * 1000, // 1 hour
      };
    }

    // Partial information - try to complete
    if (gapType === 'partial_info') {
      return {
        type: 'expert_contact',
        priority: 'medium',
        timeout: 3 * 60 * 60 * 1000, // 3 hours
        completionFocus: true,
      };
    }

    // Default escalation
    return {
      type: 'escalation',
      priority: 'low',
      timeout: 24 * 60 * 60 * 1000, // 24 hours
    };
  }

  /**
   * Execute expert contact workflow
   * @param {Object} workflow - Workflow object
   * @returns {Promise<Object>} - Workflow result
   */
  async executeExpertContactWorkflow(workflow) {
    try {
      const { query, gapAnalysis } = workflow;

      // Step 1: Locate appropriate expert
      this.addWorkflowStep(workflow, 'locating_expert', 'in_progress');
      
      const expert = await this.contactLocator.findExpert(query, gapAnalysis);
      
      if (!expert) {
        this.addWorkflowStep(workflow, 'locating_expert', 'failed', 'No suitable expert found');
        return {
          success: false,
          reason: 'no_expert_found',
          message: 'Could not locate an appropriate expert for this query',
        };
      }

      this.addWorkflowStep(workflow, 'locating_expert', 'completed', `Found expert: ${expert.name}`);

      // Step 2: Send information request
      this.addWorkflowStep(workflow, 'sending_request', 'in_progress');

      const request = await this.communicationManager.sendInformationRequest({
        expert: expert,
        query: query,
        gapAnalysis: gapAnalysis,
        context: workflow.context,
        workflowId: workflow.id,
      });

      if (!request.success) {
        this.addWorkflowStep(workflow, 'sending_request', 'failed', request.error);
        return {
          success: false,
          reason: 'request_failed',
          message: 'Failed to send information request to expert',
          error: request.error,
        };
      }

      this.addWorkflowStep(workflow, 'sending_request', 'completed', 'Request sent successfully');

      // Step 3: Set up monitoring for response
      this.addWorkflowStep(workflow, 'awaiting_response', 'in_progress');

      const responseMonitor = this.setupResponseMonitoring(workflow, expert, request);

      return {
        success: true,
        workflowId: workflow.id,
        expert: expert,
        requestId: request.id,
        estimatedResponseTime: expert.responseTime || '2-4 hours',
        monitoringActive: true,
        message: `Information request sent to ${expert.name}. Monitoring for response.`,
      };
    } catch (error) {
      logger.error(`Expert contact workflow failed for ${workflow.id}:`, error);
      this.addWorkflowStep(workflow, 'workflow_error', 'failed', error.message);
      
      return {
        success: false,
        reason: 'workflow_error',
        message: 'Expert contact workflow encountered an error',
        error: error.message,
      };
    }
  }

  /**
   * Execute document search workflow
   * @param {Object} workflow - Workflow object
   * @returns {Promise<Object>} - Workflow result
   */
  async executeDocumentSearchWorkflow(workflow) {
    try {
      const { query, gapAnalysis } = workflow;

      // Step 1: Expand search using suggested queries
      this.addWorkflowStep(workflow, 'expanding_search', 'in_progress');

      const expandedResults = await this.performExpandedSearch(query, gapAnalysis.suggestedQueries);

      if (expandedResults.found) {
        this.addWorkflowStep(workflow, 'expanding_search', 'completed', 
          `Found ${expandedResults.documents.length} additional documents`);
        
        return {
          success: true,
          reason: 'documents_found',
          documents: expandedResults.documents,
          message: 'Additional relevant documents found through expanded search',
        };
      }

      this.addWorkflowStep(workflow, 'expanding_search', 'completed', 'No additional documents found');

      // Step 2: Fallback to expert contact if configured
      if (workflow.strategy.fallback === 'expert_contact') {
        this.addWorkflowStep(workflow, 'fallback_to_expert', 'in_progress');
        
        const expertResult = await this.executeExpertContactWorkflow(workflow);
        
        this.addWorkflowStep(workflow, 'fallback_to_expert', 
          expertResult.success ? 'completed' : 'failed', 
          expertResult.message);
        
        return expertResult;
      }

      return {
        success: false,
        reason: 'no_documents_found',
        message: 'No relevant documents found even with expanded search',
      };
    } catch (error) {
      logger.error(`Document search workflow failed for ${workflow.id}:`, error);
      this.addWorkflowStep(workflow, 'workflow_error', 'failed', error.message);
      
      return {
        success: false,
        reason: 'workflow_error',
        message: 'Document search workflow encountered an error',
        error: error.message,
      };
    }
  }

  /**
   * Execute escalation workflow
   * @param {Object} workflow - Workflow object
   * @returns {Promise<Object>} - Workflow result
   */
  async executeEscalationWorkflow(workflow) {
    try {
      // Step 1: Log the escalation
      this.addWorkflowStep(workflow, 'logging_escalation', 'in_progress');

      const escalationLog = {
        workflowId: workflow.id,
        query: workflow.query,
        gapAnalysis: workflow.gapAnalysis,
        timestamp: new Date().toISOString(),
        requiresHumanReview: true,
      };

      await this.logEscalation(escalationLog);
      this.addWorkflowStep(workflow, 'logging_escalation', 'completed', 'Escalation logged for human review');

      // Step 2: Notify administrators
      this.addWorkflowStep(workflow, 'notifying_admins', 'in_progress');

      const notificationResult = await this.communicationManager.notifyAdministrators({
        type: 'knowledge_gap_escalation',
        workflowId: workflow.id,
        query: workflow.query,
        gapAnalysis: workflow.gapAnalysis,
        priority: workflow.strategy.priority,
      });

      this.addWorkflowStep(workflow, 'notifying_admins', 
        notificationResult.success ? 'completed' : 'failed',
        notificationResult.message);

      return {
        success: true,
        reason: 'escalated',
        message: 'Query has been escalated for human review',
        escalationId: escalationLog.id,
      };
    } catch (error) {
      logger.error(`Escalation workflow failed for ${workflow.id}:`, error);
      this.addWorkflowStep(workflow, 'workflow_error', 'failed', error.message);
      
      return {
        success: false,
        reason: 'workflow_error',
        message: 'Escalation workflow encountered an error',
        error: error.message,
      };
    }
  }

  /**
   * Execute clarification workflow
   * @param {Object} workflow - Workflow object
   * @returns {Promise<Object>} - Workflow result
   */
  async executeClarificationWorkflow(workflow) {
    try {
      // For now, return suggestions for clarification
      // In a full implementation, this could interact with the user
      
      const clarificationSuggestions = this.generateClarificationSuggestions(workflow.query);

      this.addWorkflowStep(workflow, 'generating_suggestions', 'completed', 
        `Generated ${clarificationSuggestions.length} clarification suggestions`);

      return {
        success: true,
        reason: 'clarification_needed',
        suggestions: clarificationSuggestions,
        message: 'Please clarify your question for better results',
      };
    } catch (error) {
      logger.error(`Clarification workflow failed for ${workflow.id}:`, error);
      this.addWorkflowStep(workflow, 'workflow_error', 'failed', error.message);
      
      return {
        success: false,
        reason: 'workflow_error',
        message: 'Clarification workflow encountered an error',
        error: error.message,
      };
    }
  }

  /**
   * Execute default workflow
   * @param {Object} workflow - Workflow object
   * @returns {Promise<Object>} - Workflow result
   */
  async executeDefaultWorkflow(workflow) {
    // Default workflow just logs the gap and provides standard response
    this.addWorkflowStep(workflow, 'default_handling', 'completed', 'Applied default knowledge gap handling');

    return {
      success: true,
      reason: 'default_handling',
      message: 'Knowledge gap has been logged. Standard response provided.',
    };
  }

  /**
   * Add a step to the workflow
   * @param {Object} workflow - Workflow object
   * @param {string} step - Step name
   * @param {string} status - Step status
   * @param {string} details - Step details
   */
  addWorkflowStep(workflow, step, status, details = '') {
    workflow.steps.push({
      step: step,
      status: status,
      details: details,
      timestamp: new Date().toISOString(),
    });
    workflow.updatedAt = new Date().toISOString();
    
    logger.debug(`Workflow ${workflow.id} - ${step}: ${status} - ${details}`);
  }

  /**
   * Perform expanded search with alternative queries
   * @param {string} originalQuery - Original query
   * @param {Array} suggestedQueries - Suggested alternative queries
   * @returns {Promise<Object>} - Search results
   */
  async performExpandedSearch(originalQuery, suggestedQueries) {
    // This would integrate with the vector database to perform additional searches
    // For now, return a placeholder response
    
    logger.info(`Performing expanded search with ${suggestedQueries.length} alternative queries`);
    
    // In a real implementation, this would:
    // 1. Search with each suggested query
    // 2. Combine and deduplicate results
    // 3. Return the best matches
    
    return {
      found: false,
      documents: [],
      queries_tried: suggestedQueries,
    };
  }

  /**
   * Generate clarification suggestions
   * @param {string} query - Original query
   * @returns {Array} - Clarification suggestions
   */
  generateClarificationSuggestions(query) {
    const suggestions = [
      'Could you provide more specific details about what you\'re looking for?',
      'Are you looking for information about a specific department or process?',
      'What is the context or situation where you need this information?',
      'Are you looking for current information or historical data?',
    ];

    // Add query-specific suggestions based on keywords
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('who')) {
      suggestions.push('Are you looking for a specific person, role, or department?');
    }
    
    if (queryLower.includes('when')) {
      suggestions.push('Are you asking about timing, deadlines, or schedules?');
    }
    
    if (queryLower.includes('how')) {
      suggestions.push('Are you looking for a step-by-step process or general guidelines?');
    }

    return suggestions.slice(0, 5); // Return top 5 suggestions
  }

  /**
   * Setup response monitoring for expert contact
   * @param {Object} workflow - Workflow object
   * @param {Object} expert - Expert contact
   * @param {Object} request - Request details
   * @returns {Object} - Monitor configuration
   */
  setupResponseMonitoring(workflow, expert, request) {
    // Set up timeout monitoring
    const timeout = setTimeout(() => {
      this.handleResponseTimeout(workflow.id, expert, request);
    }, workflow.strategy.timeout);

    const monitor = {
      workflowId: workflow.id,
      expertId: expert.id,
      requestId: request.id,
      timeout: timeout,
      createdAt: new Date().toISOString(),
    };

    // Store monitor for later reference
    workflow.monitor = monitor;

    return monitor;
  }

  /**
   * Handle response timeout
   * @param {string} workflowId - Workflow ID
   * @param {Object} expert - Expert contact
   * @param {Object} request - Request details
   */
  async handleResponseTimeout(workflowId, expert, request) {
    try {
      logger.warn(`Response timeout for workflow ${workflowId}`);

      const workflow = this.activeWorkflows.get(workflowId);
      if (workflow) {
        this.addWorkflowStep(workflow, 'response_timeout', 'failed', 
          `No response received within ${workflow.strategy.timeout}ms`);

        // Send follow-up or escalate
        await this.communicationManager.sendFollowUpRequest({
          originalRequest: request,
          expert: expert,
          workflowId: workflowId,
        });
      }
    } catch (error) {
      logger.error(`Failed to handle response timeout for workflow ${workflowId}:`, error);
    }
  }

  /**
   * Process received response
   * @param {string} workflowId - Workflow ID
   * @param {Object} response - Received response
   * @returns {Promise<Object>} - Processing result
   */
  async processResponse(workflowId, response) {
    try {
      const workflow = this.activeWorkflows.get(workflowId);
      if (!workflow) {
        throw new Error(`Workflow ${workflowId} not found`);
      }

      this.addWorkflowStep(workflow, 'processing_response', 'in_progress');

      // Process the received information
      const processedInfo = await this.informationProcessor.processReceivedInformation(response);

      if (processedInfo.success) {
        this.addWorkflowStep(workflow, 'processing_response', 'completed', 
          'Information processed and ready for integration');

        // Update workflow status
        workflow.status = 'response_received';
        workflow.response = processedInfo;

        return {
          success: true,
          processedInfo: processedInfo,
          readyForIntegration: true,
        };
      } else {
        this.addWorkflowStep(workflow, 'processing_response', 'failed', 
          processedInfo.error || 'Failed to process response');

        return {
          success: false,
          error: processedInfo.error,
        };
      }
    } catch (error) {
      logger.error(`Failed to process response for workflow ${workflowId}:`, error);
      throw error;
    }
  }

  /**
   * Archive completed workflow
   * @param {Object} workflow - Workflow object
   */
  async archiveWorkflow(workflow) {
    try {
      // Remove from active workflows
      this.activeWorkflows.delete(workflow.id);

      // Add to history
      this.workflowHistory.push(workflow);

      // Limit history size
      if (this.workflowHistory.length > 1000) {
        this.workflowHistory.shift();
      }

      // Save to file
      const archivePath = path.join(
        this.config.logging.logDirectory, 
        'workflows', 
        `${workflow.id}.json`
      );
      
      await fs.writeJson(archivePath, workflow, { spaces: 2 });

      logger.debug(`Archived workflow ${workflow.id}`);
    } catch (error) {
      logger.error(`Failed to archive workflow ${workflow.id}:`, error);
    }
  }

  /**
   * Log escalation for human review
   * @param {Object} escalationLog - Escalation details
   */
  async logEscalation(escalationLog) {
    try {
      const escalationPath = path.join(
        this.config.logging.logDirectory,
        'escalations.jsonl'
      );

      escalationLog.id = uuidv4();
      await fs.appendFile(escalationPath, JSON.stringify(escalationLog) + '\n');

      logger.info(`Logged escalation ${escalationLog.id}`);
    } catch (error) {
      logger.error('Failed to log escalation:', error);
      throw error;
    }
  }

  /**
   * Get workflow statistics
   * @returns {Object} - Workflow statistics
   */
  getStatistics() {
    return {
      activeWorkflows: this.activeWorkflows.size,
      completedWorkflows: this.workflowHistory.length,
      workflowHistory: this.workflowHistory.slice(-10), // Recent 10
    };
  }

  /**
   * Close the workflow manager
   */
  async close() {
    // Cancel all active workflows
    for (const workflow of this.activeWorkflows.values()) {
      if (workflow.monitor && workflow.monitor.timeout) {
        clearTimeout(workflow.monitor.timeout);
      }
    }

    this.activeWorkflows.clear();
    this.isInitialized = false;
    logger.info('Agent Workflow Manager closed');
  }
}

module.exports = AgentWorkflowManager;
