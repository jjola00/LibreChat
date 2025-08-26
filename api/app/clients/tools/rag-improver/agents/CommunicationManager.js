const { logger } = require('@librechat/data-schemas');
const axios = require('axios');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');

/**
 * Communication Manager
 * Handles sending requests to experts and administrators
 */
class CommunicationManager {
  constructor(config) {
    this.config = config;
    this.emailTransporter = null;
    this.pendingRequests = new Map();
    this.isInitialized = false;
  }

  /**
   * Initialize the communication manager
   */
  async initialize() {
    try {
      logger.info('Initializing Communication Manager...');

      // Initialize email transporter if enabled
      if (this.config.agentWorkflow.emailSettings.enabled) {
        await this.initializeEmailTransporter();
      }

      this.isInitialized = true;
      logger.info('Communication Manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Communication Manager:', error);
      throw error;
    }
  }

  /**
   * Initialize email transporter
   */
  async initializeEmailTransporter() {
    try {
      const emailConfig = this.config.agentWorkflow.emailSettings;

      this.emailTransporter = nodemailer.createTransporter({
        host: emailConfig.smtpHost,
        port: emailConfig.smtpPort,
        secure: emailConfig.smtpPort === 465,
        auth: {
          user: emailConfig.smtpUser,
          pass: emailConfig.smtpPass,
        },
      });

      // Verify connection
      await this.emailTransporter.verify();
      logger.info('Email transporter initialized successfully');
    } catch (error) {
      logger.warn('Failed to initialize email transporter:', error.message);
      this.emailTransporter = null;
    }
  }

  /**
   * Send information request to expert
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - Request result
   */
  async sendInformationRequest(options) {
    try {
      const { expert, query, gapAnalysis, context, workflowId } = options;

      const requestId = uuidv4();
      const request = {
        id: requestId,
        workflowId: workflowId,
        expert: expert,
        query: query,
        gapAnalysis: gapAnalysis,
        context: context,
        sentAt: new Date().toISOString(),
        status: 'pending',
      };

      // Generate request message
      const message = this.generateInformationRequestMessage(request);

      // Send via preferred communication method
      let result = { success: false };

      if (expert.slack && this.config.agentWorkflow.slackWebhookUrl) {
        result = await this.sendSlackMessage(expert.slack, message, request);
      } else if (expert.email && this.emailTransporter) {
        result = await this.sendEmailRequest(expert.email, message, request);
      } else {
        result = {
          success: false,
          error: 'No available communication method for expert',
        };
      }

      if (result.success) {
        // Store pending request
        this.pendingRequests.set(requestId, request);
        
        logger.info(`Information request sent to ${expert.name} (${requestId})`);
      }

      return {
        ...result,
        id: requestId,
        expert: expert,
      };
    } catch (error) {
      logger.error('Failed to send information request:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Generate information request message
   * @param {Object} request - Request details
   * @returns {Object} - Message content
   */
  generateInformationRequestMessage(request) {
    const { expert, query, gapAnalysis, workflowId } = request;

    const subject = `Knowledge Base Information Request - ${gapAnalysis.gapType}`;
    
    const messageText = `
Hello ${expert.name},

I'm the automated knowledge assistant for Dogpatch Labs. I've received a query that requires your expertise:

**User Query:** "${query}"

**Knowledge Gap Analysis:**
- Gap Type: ${gapAnalysis.gapType}
- Missing Information: ${gapAnalysis.missingInfo}
- Confidence Level: ${Math.round(gapAnalysis.confidence * 100)}%

**Why you were selected:**
You were identified as the best expert for this query based on your role in ${expert.domain} and expertise in ${expert.expertise?.join(', ') || expert.domain}.

**What I need:**
${this.generateSpecificRequest(gapAnalysis)}

**How to respond:**
Please reply to this message with the requested information. Your response will be automatically processed and integrated into our knowledge base to help future similar queries.

**Request ID:** ${request.id}
**Workflow ID:** ${workflowId}

Thank you for helping improve our knowledge base!

Best regards,
LibreChat Knowledge Assistant
Dogpatch Labs
`;

    const messageHtml = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #2c3e50;">Knowledge Base Information Request</h2>
  
  <div style="background: #f8f9fa; padding: 15px; border-left: 4px solid #3498db; margin: 15px 0;">
    <strong>User Query:</strong> "${query}"
  </div>

  <h3>Knowledge Gap Analysis</h3>
  <ul>
    <li><strong>Gap Type:</strong> ${gapAnalysis.gapType}</li>
    <li><strong>Missing Information:</strong> ${gapAnalysis.missingInfo}</li>
    <li><strong>Confidence Level:</strong> ${Math.round(gapAnalysis.confidence * 100)}%</li>
  </ul>

  <h3>Why you were selected</h3>
  <p>You were identified as the best expert for this query based on your role in <strong>${expert.domain}</strong> and expertise in <strong>${expert.expertise?.join(', ') || expert.domain}</strong>.</p>

  <h3>What I need</h3>
  <div style="background: #fff3cd; padding: 15px; border: 1px solid #ffeaa7; border-radius: 5px;">
    ${this.generateSpecificRequest(gapAnalysis)}
  </div>

  <h3>How to respond</h3>
  <p>Please reply to this message with the requested information. Your response will be automatically processed and integrated into our knowledge base to help future similar queries.</p>

  <div style="background: #e9ecef; padding: 10px; margin: 15px 0; font-size: 12px;">
    <strong>Request ID:</strong> ${request.id}<br>
    <strong>Workflow ID:</strong> ${workflowId}
  </div>

  <p style="font-style: italic;">Thank you for helping improve our knowledge base!</p>
  
  <p><strong>LibreChat Knowledge Assistant</strong><br>
  Dogpatch Labs</p>
</div>
`;

    return {
      subject: subject,
      text: messageText,
      html: messageHtml,
    };
  }

  /**
   * Generate specific request based on gap analysis
   * @param {Object} gapAnalysis - Gap analysis result
   * @returns {string} - Specific request text
   */
  generateSpecificRequest(gapAnalysis) {
    switch (gapAnalysis.gapType) {
      case 'no_documents':
        return 'Please provide any relevant documentation, procedures, or information that would help answer this query. If documents exist, please let me know where they can be found.';
      
      case 'outdated_info':
        return 'The information in our knowledge base appears to be outdated. Please provide the current/updated information and any recent changes to policies or procedures.';
      
      case 'partial_info':
        return 'I have some information about this topic, but it seems incomplete. Please provide additional details or clarification to complete the answer.';
      
      case 'unclear_question':
        return 'The user\'s question needs clarification. Based on your expertise, what additional information should I ask the user to provide a complete answer?';
      
      default:
        return 'Please provide any relevant information, documentation, or guidance that would help answer this query comprehensively.';
    }
  }

  /**
   * Send Slack message
   * @param {string} channel - Slack channel or user
   * @param {Object} message - Message content
   * @param {Object} request - Request details
   * @returns {Promise<Object>} - Send result
   */
  async sendSlackMessage(channel, message, request) {
    try {
      if (!this.config.agentWorkflow.slackWebhookUrl) {
        throw new Error('Slack webhook URL not configured');
      }

      const slackPayload = {
        channel: channel,
        text: message.subject,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🤖 Knowledge Base Information Request',
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*User Query:* "${request.query}"`,
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Gap Type:* ${request.gapAnalysis.gapType}`,
              },
              {
                type: 'mrkdwn',
                text: `*Confidence:* ${Math.round(request.gapAnalysis.confidence * 100)}%`,
              },
            ],
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Missing Information:* ${request.gapAnalysis.missingInfo}`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Request ID:* \`${request.id}\``,
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Reply with Information',
                },
                style: 'primary',
                value: request.id,
              },
            ],
          },
        ],
      };

      const response = await axios.post(this.config.agentWorkflow.slackWebhookUrl, slackPayload);

      return {
        success: response.status === 200,
        method: 'slack',
        channel: channel,
      };
    } catch (error) {
      logger.error('Failed to send Slack message:', error);
      return {
        success: false,
        method: 'slack',
        error: error.message,
      };
    }
  }

  /**
   * Send email request
   * @param {string} email - Recipient email
   * @param {Object} message - Message content
   * @param {Object} request - Request details
   * @returns {Promise<Object>} - Send result
   */
  async sendEmailRequest(email, message, request) {
    try {
      if (!this.emailTransporter) {
        throw new Error('Email transporter not available');
      }

      const mailOptions = {
        from: this.config.agentWorkflow.emailSettings.smtpUser,
        to: email,
        subject: message.subject,
        text: message.text,
        html: message.html,
        headers: {
          'X-Request-ID': request.id,
          'X-Workflow-ID': request.workflowId,
        },
      };

      const result = await this.emailTransporter.sendMail(mailOptions);

      return {
        success: true,
        method: 'email',
        email: email,
        messageId: result.messageId,
      };
    } catch (error) {
      logger.error('Failed to send email request:', error);
      return {
        success: false,
        method: 'email',
        error: error.message,
      };
    }
  }

  /**
   * Send follow-up request
   * @param {Object} options - Follow-up options
   * @returns {Promise<Object>} - Send result
   */
  async sendFollowUpRequest(options) {
    try {
      const { originalRequest, expert, workflowId } = options;

      const followUpMessage = {
        subject: `Follow-up: Knowledge Base Information Request - ${originalRequest.id}`,
        text: `
Hello ${expert.name},

This is a follow-up to our previous knowledge base information request (ID: ${originalRequest.id}).

We haven't received a response yet, and wanted to check if you need any clarification or if there are any issues with the request.

Original Query: "${originalRequest.query}"

If you're unable to provide the information, please let us know so we can find alternative sources.

Thank you for your time!

Best regards,
LibreChat Knowledge Assistant
`,
        html: `
<div style="font-family: Arial, sans-serif;">
  <h3>Follow-up: Knowledge Base Information Request</h3>
  <p>Hello ${expert.name},</p>
  <p>This is a follow-up to our previous knowledge base information request (ID: <code>${originalRequest.id}</code>).</p>
  <p>We haven't received a response yet, and wanted to check if you need any clarification or if there are any issues with the request.</p>
  <p><strong>Original Query:</strong> "${originalRequest.query}"</p>
  <p>If you're unable to provide the information, please let us know so we can find alternative sources.</p>
  <p>Thank you for your time!</p>
</div>
`,
      };

      // Use same communication method as original request
      let result;
      if (expert.slack && this.config.agentWorkflow.slackWebhookUrl) {
        result = await this.sendSlackMessage(expert.slack, followUpMessage, originalRequest);
      } else if (expert.email && this.emailTransporter) {
        result = await this.sendEmailRequest(expert.email, followUpMessage, originalRequest);
      }

      logger.info(`Follow-up request sent for ${originalRequest.id}`);
      return result;
    } catch (error) {
      logger.error('Failed to send follow-up request:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Notify administrators
   * @param {Object} notification - Notification details
   * @returns {Promise<Object>} - Send result
   */
  async notifyAdministrators(notification) {
    try {
      const { type, workflowId, query, gapAnalysis, priority } = notification;

      const adminMessage = {
        subject: `Knowledge Base Alert: ${type} - Priority: ${priority}`,
        text: `
Knowledge Base Alert

Type: ${type}
Workflow ID: ${workflowId}
Priority: ${priority}

User Query: "${query}"

Gap Analysis:
- Gap Type: ${gapAnalysis.gapType}
- Missing Information: ${gapAnalysis.missingInfo}
- Confidence: ${Math.round(gapAnalysis.confidence * 100)}%

This query has been escalated for human review. Please investigate and take appropriate action.

Workflow ID: ${workflowId}
Timestamp: ${new Date().toISOString()}
`,
        html: `
<div style="font-family: Arial, sans-serif;">
  <h2 style="color: #e74c3c;">Knowledge Base Alert</h2>
  <div style="background: #f8d7da; padding: 15px; border: 1px solid #f5c6cb; border-radius: 5px;">
    <strong>Type:</strong> ${type}<br>
    <strong>Priority:</strong> ${priority}<br>
    <strong>Workflow ID:</strong> ${workflowId}
  </div>
  <h3>User Query</h3>
  <p style="background: #f8f9fa; padding: 10px; border-left: 4px solid #6c757d;">"${query}"</p>
  <h3>Gap Analysis</h3>
  <ul>
    <li><strong>Gap Type:</strong> ${gapAnalysis.gapType}</li>
    <li><strong>Missing Information:</strong> ${gapAnalysis.missingInfo}</li>
    <li><strong>Confidence:</strong> ${Math.round(gapAnalysis.confidence * 100)}%</li>
  </ul>
  <p>This query has been escalated for human review. Please investigate and take appropriate action.</p>
  <p><small>Timestamp: ${new Date().toISOString()}</small></p>
</div>
`,
      };

      // Send to admin contacts
      const adminContacts = this.config.employeeDirectory.defaultContacts.admin;
      let results = [];

      if (adminContacts.email && this.emailTransporter) {
        const emailResult = await this.sendEmailRequest(adminContacts.email, adminMessage, { id: workflowId });
        results.push(emailResult);
      }

      if (adminContacts.slack && this.config.agentWorkflow.slackWebhookUrl) {
        const slackResult = await this.sendSlackMessage(adminContacts.slack, adminMessage, { id: workflowId });
        results.push(slackResult);
      }

      const success = results.some(result => result.success);

      return {
        success: success,
        results: results,
        message: success ? 'Administrators notified' : 'Failed to notify administrators',
      };
    } catch (error) {
      logger.error('Failed to notify administrators:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Process incoming response
   * @param {string} requestId - Request ID
   * @param {string} response - Response content
   * @returns {Promise<Object>} - Processing result
   */
  async processIncomingResponse(requestId, response) {
    try {
      const request = this.pendingRequests.get(requestId);
      
      if (!request) {
        throw new Error(`Request ${requestId} not found`);
      }

      // Update request status
      request.status = 'responded';
      request.response = response;
      request.respondedAt = new Date().toISOString();

      // Remove from pending requests
      this.pendingRequests.delete(requestId);

      logger.info(`Received response for request ${requestId}`);

      return {
        success: true,
        request: request,
        response: response,
      };
    } catch (error) {
      logger.error(`Failed to process incoming response for ${requestId}:`, error);
      throw error;
    }
  }

  /**
   * Get pending requests statistics
   * @returns {Object} - Statistics
   */
  getStatistics() {
    return {
      pendingRequests: this.pendingRequests.size,
      oldestPendingRequest: this.getOldestPendingRequest(),
    };
  }

  /**
   * Get oldest pending request
   * @returns {Object|null} - Oldest request
   */
  getOldestPendingRequest() {
    let oldest = null;
    let oldestTime = Date.now();

    for (const request of this.pendingRequests.values()) {
      const sentTime = new Date(request.sentAt).getTime();
      if (sentTime < oldestTime) {
        oldestTime = sentTime;
        oldest = request;
      }
    }

    return oldest;
  }

  /**
   * Close the communication manager
   */
  async close() {
    if (this.emailTransporter) {
      this.emailTransporter.close();
    }
    
    this.pendingRequests.clear();
    this.isInitialized = false;
    logger.info('Communication Manager closed');
  }
}

module.exports = CommunicationManager;
