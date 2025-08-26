const { Tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');
const { 
  createRAGQueryTool, 
  createKnowledgeUpdateTool, 
  createKnowledgeStatusTool 
} = require('../rag-improver/LibreChatIntegration');

/**
 * Dogpatch Labs Knowledge Base Tool
 * Main entry point for the self-improving RAG system in LibreChat
 */
class DogpatchKnowledgeBase extends Tool {
  constructor(config = {}) {
    super();
    this.name = 'dogpatch_knowledge_base';
    this.description = `Access the Dogpatch Labs intelligent knowledge base. This tool provides:

🔍 **Smart Search**: Find company policies, procedures, and documentation
🤖 **Self-Improving**: Automatically identifies knowledge gaps and gathers missing information
📚 **Comprehensive Coverage**: Searches across all company resources
⚡ **Real-time Updates**: Continuously updated with new information
🎯 **Expert Workflows**: Automatically contacts relevant experts when information is missing

**Example queries:**
- "How do I book a meeting room?"
- "What is the annual leave policy?"
- "Who handles IT support requests?"
- "What are the office WiFi details?"
- "How do I submit an expense report?"

The system will provide the best available answer and automatically work to fill any knowledge gaps it discovers.`;

    this.config = config;
    this.isInitialized = false;
    this.ragQueryTool = null;
    this.updateTool = null;
    this.statusTool = null;
  }

  /**
   * Initialize the knowledge base tools
   */
  async initialize() {
    try {
      logger.info('Initializing Dogpatch Knowledge Base Tool...');

      // Create the underlying RAG tools
      this.ragQueryTool = createRAGQueryTool();
      this.updateTool = createKnowledgeUpdateTool();
      this.statusTool = createKnowledgeStatusTool();

      this.isInitialized = true;
      logger.info('Dogpatch Knowledge Base Tool initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Dogpatch Knowledge Base Tool:', error);
      throw error;
    }
  }

  /**
   * Main tool execution method
   * @param {string} input - User input/query
   * @returns {Promise<string>} - Tool response
   */
  async _call(input) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      logger.info(`Dogpatch Knowledge Base query: "${input}"`);

      // Parse the input to determine intent
      const intent = this.parseIntent(input);

      switch (intent.type) {
        case 'search':
          return await this.handleSearch(intent.query, intent.options);
        
        case 'update':
          return await this.handleUpdate(intent.information, intent.metadata);
        
        case 'status':
          return await this.handleStatus();
        
        default:
          // Default to search behavior
          return await this.handleSearch(input);
      }
    } catch (error) {
      logger.error('Dogpatch Knowledge Base error:', error);
      
      return `I apologize, but I encountered an error while accessing the knowledge base. Error: ${error.message}

Please try again or contact an administrator if the problem persists.`;
    }
  }

  /**
   * Parse user input to determine intent
   * @param {string} input - User input
   * @returns {Object} - Parsed intent
   */
  parseIntent(input) {
    const inputLower = input.toLowerCase().trim();

    // Check for update intent
    if (inputLower.includes('add to knowledge') || 
        inputLower.includes('update knowledge') || 
        inputLower.startsWith('add:') ||
        inputLower.startsWith('update:')) {
      return {
        type: 'update',
        information: input.replace(/^(add:|update:|add to knowledge|update knowledge)/i, '').trim(),
        metadata: this.extractMetadata(input),
      };
    }

    // Check for status intent
    if (inputLower.includes('knowledge base status') || 
        inputLower.includes('kb status') || 
        inputLower.includes('system status') ||
        inputLower === 'status') {
      return {
        type: 'status',
      };
    }

    // Default to search
    return {
      type: 'search',
      query: input,
      options: this.extractSearchOptions(input),
    };
  }

  /**
   * Extract metadata from update input
   * @param {string} input - User input
   * @returns {Object} - Extracted metadata
   */
  extractMetadata(input) {
    const metadata = {};

    // Try to extract category
    const categoryMatch = input.match(/category:\s*([^\n,]+)/i);
    if (categoryMatch) {
      metadata.category = categoryMatch[1].trim();
    }

    // Try to extract title
    const titleMatch = input.match(/title:\s*([^\n,]+)/i);
    if (titleMatch) {
      metadata.title = titleMatch[1].trim();
    }

    return metadata;
  }

  /**
   * Extract search options from input
   * @param {string} input - User input
   * @returns {Object} - Search options
   */
  extractSearchOptions(input) {
    const options = {};

    // Check for urgent/high priority searches
    if (input.toLowerCase().includes('urgent') || input.toLowerCase().includes('asap')) {
      options.threshold = 0.6; // Lower threshold for urgent queries
      options.maxResults = 8; // More results for urgent queries
    }

    return options;
  }

  /**
   * Handle search queries
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<string>} - Search response
   */
  async handleSearch(query, options = {}) {
    try {
      const result = await this.ragQueryTool.invoke({ 
        query: query, 
        options: options 
      });

      // If result is an array (content and artifact), return the content
      if (Array.isArray(result)) {
        return result[0];
      }

      return result;
    } catch (error) {
      logger.error('Search handling error:', error);
      throw error;
    }
  }

  /**
   * Handle knowledge base updates
   * @param {string} information - Information to add
   * @param {Object} metadata - Metadata
   * @returns {Promise<string>} - Update response
   */
  async handleUpdate(information, metadata = {}) {
    try {
      const result = await this.updateTool.invoke({ 
        information: information, 
        metadata: metadata 
      });

      // If result is an array (content and artifact), return the content
      if (Array.isArray(result)) {
        return result[0];
      }

      return result;
    } catch (error) {
      logger.error('Update handling error:', error);
      throw error;
    }
  }

  /**
   * Handle status requests
   * @returns {Promise<string>} - Status response
   */
  async handleStatus() {
    try {
      const result = await this.statusTool.invoke({});

      // If result is an array (content and artifact), return the content
      if (Array.isArray(result)) {
        return result[0];
      }

      return result;
    } catch (error) {
      logger.error('Status handling error:', error);
      throw error;
    }
  }

  /**
   * Get tool schema for LibreChat
   * @returns {Object} - Tool schema
   */
  static getSchema() {
    return {
      name: 'dogpatch_knowledge_base',
      description: 'Access the Dogpatch Labs intelligent knowledge base for company information, policies, and procedures.',
      parameters: {
        type: 'object',
        properties: {
          input: {
            type: 'string',
            description: 'Your question or request about Dogpatch Labs. Can be a search query, update request, or status check.',
          },
        },
        required: ['input'],
      },
    };
  }

  /**
   * Check if the tool is available
   * @returns {boolean} - Tool availability
   */
  static isAvailable() {
    try {
      // Check if the RAG improver module is available
      require('../rag-improver/config');
      return true;
    } catch (error) {
      logger.warn('Dogpatch Knowledge Base tool not available:', error.message);
      return false;
    }
  }
}

module.exports = DogpatchKnowledgeBase;
