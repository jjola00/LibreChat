const { tool } = require('@langchain/core/tools');
const { z } = require('zod');
const { logger } = require('@librechat/data-schemas');
const { getRAGEngine } = require('./index');
const { validateConfig } = require('./config');

/**
 * LibreChat Integration for Self-Improving RAG System
 * This tool integrates the RAG system with LibreChat as a custom tool
 */

// Validate configuration on load
try {
  validateConfig();
} catch (error) {
  logger.error('RAG Improver configuration validation failed:', error);
}

/**
 * Create the RAG Query Tool for LibreChat
 * This tool allows users to query the self-improving knowledge base
 */
const createRAGQueryTool = () => {
  return tool(
    async ({ query, options = {} }) => {
      try {
        logger.info(`RAG Query Tool invoked: "${query}"`);

        // Get the RAG engine instance
        const ragEngine = await getRAGEngine();

        // Process the query
        const result = await ragEngine.query(query, {
          maxResults: options.maxResults || 5,
          threshold: options.threshold || 0.7,
          includeGapDetection: options.includeGapDetection !== false,
          userId: options.userId,
          conversationId: options.conversationId,
        });

        // Format response for LibreChat
        const response = formatRAGResponse(result);

        // Return both the formatted response and metadata
        return [response.text, response.metadata];
      } catch (error) {
        logger.error('RAG Query Tool error:', error);
        
        return [
          'I apologize, but I encountered an error while searching the knowledge base. Please try again or contact an administrator if the problem persists.',
          { error: error.message, tool: 'rag_query' }
        ];
      }
    },
    {
      name: 'knowledge_base_search',
      responseFormat: 'content_and_artifact',
      description: `Search the Dogpatch Labs knowledge base for information. This tool provides access to company documents, policies, procedures, and expert knowledge.

**Key Features:**
- Searches through all company documentation
- Provides confidence scores for answers
- Automatically detects knowledge gaps
- Triggers expert workflows when information is missing
- Maintains comprehensive audit logs

**When to use:**
- Company policy questions
- Procedure inquiries
- Contact information requests
- General company knowledge
- Technical documentation searches

**How it works:**
1. Searches the vector database for relevant information
2. Analyzes confidence and knowledge gaps
3. Generates comprehensive responses with source citations
4. If knowledge gaps are detected, may trigger automated workflows to gather missing information

**Example queries:**
- "How do I request annual leave?"
- "What is the wifi password for guests?"
- "Who should I contact about IT issues?"
- "What are the office booking procedures?"

The tool will provide the best available answer and indicate if additional information is being gathered.`,
      
      schema: z.object({
        query: z
          .string()
          .describe('Your question about Dogpatch Labs policies, procedures, or general company information. Be specific for better results.'),
        options: z
          .object({
            maxResults: z.number().optional().describe('Maximum number of documents to retrieve (default: 5)'),
            threshold: z.number().optional().describe('Minimum relevance threshold (default: 0.7)'),
            includeGapDetection: z.boolean().optional().describe('Enable knowledge gap detection (default: true)'),
          })
          .optional()
          .describe('Optional search parameters'),
      }),
    },
  );
};

/**
 * Create the Knowledge Update Tool for LibreChat
 * This tool allows authorized users to add information to the knowledge base
 */
const createKnowledgeUpdateTool = () => {
  return tool(
    async ({ information, metadata = {} }) => {
      try {
        logger.info('Knowledge Update Tool invoked');

        // Get the RAG engine instance
        const ragEngine = await getRAGEngine();

        // Process the information as a new document
        const documents = [{
          id: require('uuid').v4(),
          content: information,
          source: 'manual_update',
          filename: metadata.title || 'Manual Update',
          content_type: 'manual_entry',
          created_at: new Date().toISOString(),
          metadata: {
            title: metadata.title || 'Manual Knowledge Update',
            category: metadata.category || 'general',
            author: metadata.author || 'user',
            confidence_score: 1.0,
            manual_entry: true,
            ...metadata,
          },
        }];

        // Ingest the documents
        const result = await ragEngine.ingestDocuments(documents);

        if (result.success) {
          return [
            `Successfully added information to the knowledge base!\n\n**Details:**\n- Documents processed: ${result.documentsProcessed}\n- Category: ${metadata.category || 'general'}\n- Title: ${metadata.title || 'Manual Update'}\n\nThe information is now available for future searches.`,
            { 
              success: true, 
              documentsProcessed: result.documentsProcessed,
              tool: 'knowledge_update'
            }
          ];
        } else {
          return [
            'Failed to add information to the knowledge base. Please check the content and try again.',
            { 
              success: false, 
              error: 'Update failed',
              tool: 'knowledge_update'
            }
          ];
        }
      } catch (error) {
        logger.error('Knowledge Update Tool error:', error);
        
        return [
          'I encountered an error while updating the knowledge base. Please ensure you have the necessary permissions and try again.',
          { error: error.message, tool: 'knowledge_update' }
        ];
      }
    },
    {
      name: 'update_knowledge_base',
      responseFormat: 'content_and_artifact',
      description: `Add new information to the Dogpatch Labs knowledge base. Use this tool to contribute company knowledge, update procedures, or add documentation.

**Important:** This tool should only be used by authorized personnel to add verified company information.

**What you can add:**
- Company policies and procedures
- Contact information
- Process documentation
- FAQ answers
- Technical guides
- Best practices

**Required information:**
- Clear, accurate content
- Appropriate category
- Descriptive title

The information will be processed and made available for future knowledge base searches.`,
      
      schema: z.object({
        information: z
          .string()
          .describe('The information to add to the knowledge base. Should be clear, accurate, and well-formatted.'),
        metadata: z
          .object({
            title: z.string().optional().describe('A descriptive title for this information'),
            category: z.string().optional().describe('Category (e.g., HR, IT, Admin, Finance, General)'),
            author: z.string().optional().describe('Author or contributor name'),
            tags: z.array(z.string()).optional().describe('Relevant tags or keywords'),
          })
          .optional()
          .describe('Additional metadata for the information'),
      }),
    },
  );
};

/**
 * Create the Knowledge Status Tool for LibreChat
 * This tool provides information about the knowledge base status and recent activities
 */
const createKnowledgeStatusTool = () => {
  return tool(
    async ({}) => {
      try {
        logger.info('Knowledge Status Tool invoked');

        // Get the RAG engine instance
        const ragEngine = await getRAGEngine();

        // Get comprehensive statistics
        const stats = await ragEngine.getStatistics();

        // Format status response
        const statusText = formatStatusResponse(stats);

        return [
          statusText,
          { 
            statistics: stats,
            tool: 'knowledge_status',
            timestamp: new Date().toISOString(),
          }
        ];
      } catch (error) {
        logger.error('Knowledge Status Tool error:', error);
        
        return [
          'Unable to retrieve knowledge base status at this time.',
          { error: error.message, tool: 'knowledge_status' }
        ];
      }
    },
    {
      name: 'knowledge_base_status',
      responseFormat: 'content_and_artifact',
      description: `Get the current status of the Dogpatch Labs knowledge base, including statistics and recent activity.

**Information provided:**
- Total documents in the knowledge base
- Recent knowledge gaps detected
- Active workflows for information gathering
- System health and performance metrics
- Recent updates and additions

This tool is useful for administrators and users who want to understand the current state of the knowledge base.`,
      
      schema: z.object({}),
    },
  );
};

/**
 * Format RAG response for LibreChat display
 * @param {Object} result - RAG query result
 * @returns {Object} - Formatted response
 */
function formatRAGResponse(result) {
  let responseText = result.response;

  // Add confidence indicator
  const confidenceLevel = getConfidenceLevel(result.confidence);
  responseText += `\n\n**Confidence:** ${confidenceLevel} (${Math.round(result.confidence * 100)}%)`;

  // Add sources if available
  if (result.sources && result.sources.length > 0) {
    responseText += `\n\n**Sources:**`;
    result.sources.forEach((source, index) => {
      responseText += `\n${index + 1}. ${source.filename} (${Math.round(source.similarity * 100)}% relevant)`;
    });
  }

  // Add knowledge gap information if detected
  if (result.knowledgeGap && result.knowledgeGap.hasGap) {
    responseText += `\n\n**Note:** I've detected a knowledge gap in this area. `;
    
    switch (result.knowledgeGap.gapType) {
      case 'no_documents':
        responseText += `No relevant documents were found in our knowledge base.`;
        break;
      case 'partial_info':
        responseText += `The available information appears incomplete.`;
        break;
      case 'outdated_info':
        responseText += `The information may be outdated.`;
        break;
      default:
        responseText += `Additional information may be needed.`;
    }

    if (result.knowledgeGap.expertContactNeeded) {
      responseText += ` I'm automatically reaching out to relevant experts to gather more information.`;
    }

    // Add suggested queries if available
    if (result.knowledgeGap.suggestedQueries && result.knowledgeGap.suggestedQueries.length > 0) {
      responseText += `\n\n**You might also try asking:**`;
      result.knowledgeGap.suggestedQueries.forEach(query => {
        responseText += `\n- "${query}"`;
      });
    }
  }

  // Add processing time
  responseText += `\n\n*Processed in ${result.metadata.processingTime}ms*`;

  return {
    text: responseText,
    metadata: {
      confidence: result.confidence,
      sourcesCount: result.sources?.length || 0,
      hasGap: result.knowledgeGap?.hasGap || false,
      gapType: result.knowledgeGap?.gapType,
      processingTime: result.metadata.processingTime,
      tool: 'rag_query',
    },
  };
}

/**
 * Get confidence level description
 * @param {number} confidence - Confidence score (0-1)
 * @returns {string} - Confidence level description
 */
function getConfidenceLevel(confidence) {
  if (confidence >= 0.9) return 'Very High';
  if (confidence >= 0.8) return 'High';
  if (confidence >= 0.7) return 'Good';
  if (confidence >= 0.6) return 'Moderate';
  if (confidence >= 0.5) return 'Low';
  return 'Very Low';
}

/**
 * Format status response
 * @param {Object} stats - Statistics object
 * @returns {string} - Formatted status text
 */
function formatStatusResponse(stats) {
  let statusText = `# 📊 Knowledge Base Status\n\n`;

  // Vector Database Status
  if (stats.vectorDatabase) {
    statusText += `## 📚 Document Statistics\n`;
    statusText += `- **Total Documents:** ${stats.vectorDatabase.totalDocuments || 0}\n`;
    statusText += `- **Collection:** ${stats.vectorDatabase.collectionName}\n`;
    statusText += `- **Last Updated:** ${stats.vectorDatabase.lastUpdated}\n\n`;
  }

  // Knowledge Gaps
  if (stats.knowledgeGaps) {
    statusText += `## 🔍 Knowledge Gap Analysis\n`;
    statusText += `- **Total Analyses:** ${stats.knowledgeGaps.totalAnalyses || 0}\n`;
    statusText += `- **Gaps Detected:** ${stats.knowledgeGaps.gapsDetected || 0}\n`;
    statusText += `- **Average Confidence:** ${Math.round((stats.knowledgeGaps.avgConfidence || 0) * 100)}%\n\n`;

    if (stats.knowledgeGaps.gapTypes && Object.keys(stats.knowledgeGaps.gapTypes).length > 0) {
      statusText += `**Gap Types:**\n`;
      Object.entries(stats.knowledgeGaps.gapTypes).forEach(([type, count]) => {
        statusText += `- ${type}: ${count}\n`;
      });
      statusText += `\n`;
    }
  }

  // System Health
  statusText += `## ⚡ System Status\n`;
  statusText += `- **Status:** 🟢 Operational\n`;
  statusText += `- **Last Check:** ${new Date().toISOString()}\n`;

  return statusText;
}

module.exports = {
  createRAGQueryTool,
  createKnowledgeUpdateTool,
  createKnowledgeStatusTool,
  formatRAGResponse,
};
