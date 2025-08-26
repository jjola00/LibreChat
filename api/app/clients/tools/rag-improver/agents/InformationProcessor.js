const { ChatOpenAI } = require('@langchain/openai');
const { logger } = require('@librechat/data-schemas');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

/**
 * Information Processor
 * Processes received information from experts and prepares it for knowledge base integration
 */
class InformationProcessor {
  constructor(config) {
    this.config = config;
    this.llm = null;
    this.processedInfo = [];
    this.isInitialized = false;
  }

  /**
   * Initialize the information processor
   */
  async initialize() {
    try {
      logger.info('Initializing Information Processor...');

      this.llm = new ChatOpenAI({
        openAIApiKey: this.config.openai.apiKey,
        modelName: this.config.openai.model,
        maxTokens: 4000,
        temperature: 0.1,
      });

      this.isInitialized = true;
      logger.info('Information Processor initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Information Processor:', error);
      throw error;
    }
  }

  /**
   * Process received information from expert
   * @param {Object} response - Response from expert
   * @returns {Promise<Object>} - Processing result
   */
  async processReceivedInformation(response) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      logger.info(`Processing received information for request: ${response.requestId}`);

      const processingId = uuidv4();
      const processingResult = {
        id: processingId,
        requestId: response.requestId,
        workflowId: response.workflowId,
        originalQuery: response.originalQuery,
        expertResponse: response.content,
        expert: response.expert,
        processedAt: new Date().toISOString(),
        status: 'processing',
      };

      // Step 1: Validate and clean the information
      const validationResult = await this.validateInformation(response.content);
      processingResult.validation = validationResult;

      if (!validationResult.isValid) {
        processingResult.status = 'validation_failed';
        processingResult.error = validationResult.errors.join(', ');
        return processingResult;
      }

      // Step 2: Extract and structure the information
      const extractionResult = await this.extractStructuredInformation(response.content, response.originalQuery);
      processingResult.extraction = extractionResult;

      if (!extractionResult.success) {
        processingResult.status = 'extraction_failed';
        processingResult.error = extractionResult.error;
        return processingResult;
      }

      // Step 3: Generate document chunks for knowledge base
      const documentChunks = await this.generateDocumentChunks(extractionResult.structuredInfo, response);
      processingResult.documentChunks = documentChunks;

      // Step 4: Detect potential conflicts with existing knowledge
      const conflictAnalysis = await this.analyzeConflicts(extractionResult.structuredInfo, response.originalQuery);
      processingResult.conflictAnalysis = conflictAnalysis;

      // Step 5: Generate update recommendations
      const updateRecommendations = await this.generateUpdateRecommendations(processingResult);
      processingResult.updateRecommendations = updateRecommendations;

      processingResult.status = 'completed';
      processingResult.success = true;

      // Store processed information
      this.processedInfo.push(processingResult);
      await this.saveProcessedInformation(processingResult);

      logger.info(`Successfully processed information for request: ${response.requestId}`);
      return processingResult;
    } catch (error) {
      logger.error(`Failed to process information for request ${response.requestId}:`, error);
      
      return {
        success: false,
        requestId: response.requestId,
        error: error.message,
        processedAt: new Date().toISOString(),
        status: 'error',
      };
    }
  }

  /**
   * Validate received information
   * @param {string} information - Information to validate
   * @returns {Promise<Object>} - Validation result
   */
  async validateInformation(information) {
    try {
      const errors = [];
      
      // Basic validation checks
      if (!information || typeof information !== 'string') {
        errors.push('Information is missing or not a string');
      }

      if (information.length < 10) {
        errors.push('Information is too short to be useful');
      }

      if (information.length > 50000) {
        errors.push('Information is too long (exceeds 50,000 characters)');
      }

      // Check for PII or sensitive information
      const piiCheck = this.detectPII(information);
      if (piiCheck.hasPII) {
        errors.push(`Potentially sensitive information detected: ${piiCheck.types.join(', ')}`);
      }

      // Check for prohibited patterns
      const prohibitedCheck = this.checkProhibitedPatterns(information);
      if (prohibitedCheck.hasProhibited) {
        errors.push(`Prohibited content detected: ${prohibitedCheck.patterns.join(', ')}`);
      }

      return {
        isValid: errors.length === 0,
        errors: errors,
        warnings: piiCheck.warnings || [],
        characterCount: information.length,
        wordCount: information.split(/\s+/).length,
      };
    } catch (error) {
      logger.error('Failed to validate information:', error);
      return {
        isValid: false,
        errors: ['Validation process failed'],
      };
    }
  }

  /**
   * Detect PII in information
   * @param {string} text - Text to analyze
   * @returns {Object} - PII detection result
   */
  detectPII(text) {
    const piiPatterns = {
      email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      phone: /(\+\d{1,3}[- ]?)?\d{10,}/g,
      ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
      creditCard: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
    };

    const detected = [];
    const warnings = [];

    for (const [type, pattern] of Object.entries(piiPatterns)) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        detected.push(type);
        warnings.push(`Found ${matches.length} potential ${type} pattern(s)`);
      }
    }

    return {
      hasPII: detected.length > 0,
      types: detected,
      warnings: warnings,
    };
  }

  /**
   * Check for prohibited patterns
   * @param {string} text - Text to check
   * @returns {Object} - Check result
   */
  checkProhibitedPatterns(text) {
    const prohibited = [];
    
    for (const pattern of this.config.safety.prohibitedPatterns) {
      if (pattern.test(text)) {
        prohibited.push(pattern.source);
      }
    }

    return {
      hasProhibited: prohibited.length > 0,
      patterns: prohibited,
    };
  }

  /**
   * Extract structured information using LLM
   * @param {string} information - Raw information
   * @param {string} originalQuery - Original query for context
   * @returns {Promise<Object>} - Extraction result
   */
  async extractStructuredInformation(information, originalQuery) {
    try {
      const prompt = `
You are an expert information processor for a knowledge base system. Your task is to extract and structure information received from domain experts.

Original Query: "${originalQuery}"

Expert Response:
${information}

Please extract and structure this information in the following JSON format:
{
  "title": "A clear, descriptive title for this information",
  "summary": "A brief 2-3 sentence summary",
  "mainContent": "The core information content, cleaned and organized",
  "category": "The most appropriate category (e.g., HR, IT, Admin, Finance, etc.)",
  "keywords": ["relevant", "keywords", "for", "searching"],
  "procedures": [
    {
      "step": 1,
      "description": "Step description if this contains procedural information"
    }
  ],
  "contacts": [
    {
      "role": "Contact role",
      "name": "Contact name if mentioned",
      "email": "Contact email if provided"
    }
  ],
  "links": ["any", "relevant", "links", "mentioned"],
  "lastUpdated": "Current date in ISO format",
  "source": "Expert who provided this information",
  "confidence": 0.95,
  "applicableScenarios": ["scenarios", "where", "this", "applies"],
  "relatedTopics": ["related", "topics", "or", "keywords"]
}

Ensure the extracted information is:
1. Complete and accurate
2. Well-organized and easy to understand
3. Properly categorized
4. Includes all relevant details
5. Maintains the expert's intended meaning

Respond with only the JSON object.
`;

      const response = await this.llm.invoke([
        { role: 'user', content: prompt }
      ]);

      // Parse the JSON response
      const structuredInfo = this.parseStructuredResponse(response.content);

      return {
        success: true,
        structuredInfo: structuredInfo,
        extractionMethod: 'llm',
      };
    } catch (error) {
      logger.error('Failed to extract structured information:', error);
      
      // Fallback to basic extraction
      return this.fallbackExtraction(information, originalQuery);
    }
  }

  /**
   * Parse structured response from LLM
   * @param {string} response - LLM response
   * @returns {Object} - Parsed structure
   */
  parseStructuredResponse(response) {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate required fields
      const required = ['title', 'mainContent', 'category'];
      for (const field of required) {
        if (!parsed[field]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      // Set defaults for optional fields
      return {
        title: parsed.title,
        summary: parsed.summary || parsed.mainContent.substring(0, 200) + '...',
        mainContent: parsed.mainContent,
        category: parsed.category || 'general',
        keywords: parsed.keywords || [],
        procedures: parsed.procedures || [],
        contacts: parsed.contacts || [],
        links: parsed.links || [],
        lastUpdated: new Date().toISOString(),
        source: parsed.source || 'expert',
        confidence: parsed.confidence || 0.8,
        applicableScenarios: parsed.applicableScenarios || [],
        relatedTopics: parsed.relatedTopics || [],
      };
    } catch (error) {
      logger.error('Failed to parse structured response:', error);
      throw error;
    }
  }

  /**
   * Fallback extraction method
   * @param {string} information - Raw information
   * @param {string} originalQuery - Original query
   * @returns {Object} - Basic extraction result
   */
  fallbackExtraction(information, originalQuery) {
    try {
      // Basic extraction without LLM
      const words = information.toLowerCase().split(/\s+/);
      const title = originalQuery.length > 50 
        ? originalQuery.substring(0, 47) + '...'
        : originalQuery;

      return {
        success: true,
        structuredInfo: {
          title: title,
          summary: information.substring(0, 200) + '...',
          mainContent: information,
          category: 'general',
          keywords: this.extractBasicKeywords(words),
          procedures: [],
          contacts: [],
          links: this.extractLinks(information),
          lastUpdated: new Date().toISOString(),
          source: 'expert',
          confidence: 0.6,
          applicableScenarios: [originalQuery],
          relatedTopics: [],
        },
        extractionMethod: 'fallback',
      };
    } catch (error) {
      logger.error('Fallback extraction failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Extract basic keywords from text
   * @param {Array} words - Array of words
   * @returns {Array} - Keywords
   */
  extractBasicKeywords(words) {
    // Remove common stop words and short words
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    
    return words
      .filter(word => word.length > 3 && !stopWords.has(word))
      .filter((word, index, arr) => arr.indexOf(word) === index) // Remove duplicates
      .slice(0, 10); // Limit to 10 keywords
  }

  /**
   * Extract links from text
   * @param {string} text - Text to search
   * @returns {Array} - Found links
   */
  extractLinks(text) {
    const urlPattern = /https?:\/\/[^\s]+/g;
    const matches = text.match(urlPattern);
    return matches || [];
  }

  /**
   * Generate document chunks for knowledge base
   * @param {Object} structuredInfo - Structured information
   * @param {Object} response - Original response
   * @returns {Array} - Document chunks
   */
  async generateDocumentChunks(structuredInfo, response) {
    try {
      const chunks = [];

      // Main content chunk
      chunks.push({
        id: uuidv4(),
        content: structuredInfo.mainContent,
        source: `expert_response_${response.requestId}`,
        filename: `${structuredInfo.category}_${structuredInfo.title.replace(/[^a-zA-Z0-9]/g, '_')}.txt`,
        content_type: 'expert_response',
        chunk_index: 0,
        total_chunks: 1,
        created_at: new Date().toISOString(),
        metadata: {
          title: structuredInfo.title,
          category: structuredInfo.category,
          keywords: structuredInfo.keywords,
          expert: response.expert?.name || 'unknown',
          confidence_score: structuredInfo.confidence,
          original_query: response.originalQuery,
          request_id: response.requestId,
          workflow_id: response.workflowId,
          processing_type: 'expert_response',
          last_updated: structuredInfo.lastUpdated,
        },
      });

      // Create additional chunks for procedures if they exist
      if (structuredInfo.procedures && structuredInfo.procedures.length > 0) {
        const procedureContent = structuredInfo.procedures
          .map(proc => `Step ${proc.step}: ${proc.description}`)
          .join('\n');

        chunks.push({
          id: uuidv4(),
          content: `${structuredInfo.title} - Procedure:\n${procedureContent}`,
          source: `expert_response_${response.requestId}_procedure`,
          filename: `${structuredInfo.category}_${structuredInfo.title.replace(/[^a-zA-Z0-9]/g, '_')}_procedure.txt`,
          content_type: 'procedure',
          chunk_index: 0,
          total_chunks: 1,
          created_at: new Date().toISOString(),
          metadata: {
            title: `${structuredInfo.title} - Procedure`,
            category: structuredInfo.category,
            keywords: [...structuredInfo.keywords, 'procedure', 'steps'],
            expert: response.expert?.name || 'unknown',
            confidence_score: structuredInfo.confidence,
            original_query: response.originalQuery,
            request_id: response.requestId,
            workflow_id: response.workflowId,
            processing_type: 'procedure',
            step_count: structuredInfo.procedures.length,
          },
        });
      }

      return chunks;
    } catch (error) {
      logger.error('Failed to generate document chunks:', error);
      return [];
    }
  }

  /**
   * Analyze conflicts with existing knowledge
   * @param {Object} structuredInfo - New information
   * @param {string} originalQuery - Original query
   * @returns {Promise<Object>} - Conflict analysis
   */
  async analyzeConflicts(structuredInfo, originalQuery) {
    try {
      // This would integrate with the vector database to find similar content
      // For now, return a basic analysis
      
      return {
        hasConflicts: false,
        conflictType: 'none',
        conflictingDocuments: [],
        similarity: 0,
        recommendedAction: 'add_new',
        confidence: 0.8,
      };
    } catch (error) {
      logger.error('Failed to analyze conflicts:', error);
      return {
        hasConflicts: false,
        error: error.message,
      };
    }
  }

  /**
   * Generate update recommendations
   * @param {Object} processingResult - Processing result
   * @returns {Object} - Update recommendations
   */
  generateUpdateRecommendations(processingResult) {
    try {
      const { extraction, conflictAnalysis, documentChunks } = processingResult;

      const recommendations = {
        action: 'add_to_knowledge_base',
        priority: 'medium',
        requiresHumanReview: false,
        estimatedImpact: 'medium',
        recommendations: [],
      };

      // Determine priority based on various factors
      if (extraction.structuredInfo.confidence > 0.9) {
        recommendations.priority = 'high';
        recommendations.recommendations.push('High confidence information - prioritize for immediate addition');
      }

      if (conflictAnalysis.hasConflicts) {
        recommendations.requiresHumanReview = true;
        recommendations.recommendations.push('Conflicts detected - human review required before integration');
      }

      if (extraction.structuredInfo.category === 'HR' || extraction.structuredInfo.category === 'IT') {
        recommendations.priority = 'high';
        recommendations.recommendations.push('Critical department information - high priority for integration');
      }

      if (documentChunks.length > 1) {
        recommendations.recommendations.push('Multiple document types generated - consider separate integration');
      }

      recommendations.summary = `Recommendation: ${recommendations.action} with ${recommendations.priority} priority${recommendations.requiresHumanReview ? ' (requires human review)' : ''}`;

      return recommendations;
    } catch (error) {
      logger.error('Failed to generate update recommendations:', error);
      return {
        action: 'manual_review',
        error: error.message,
      };
    }
  }

  /**
   * Save processed information to file
   * @param {Object} processingResult - Processing result
   */
  async saveProcessedInformation(processingResult) {
    try {
      const filename = `processed_${processingResult.id}.json`;
      const filepath = path.join(this.config.logging.logDirectory, 'processed_info', filename);
      
      await fs.ensureDir(path.dirname(filepath));
      await fs.writeJson(filepath, processingResult, { spaces: 2 });

      logger.debug(`Saved processed information: ${filename}`);
    } catch (error) {
      logger.error('Failed to save processed information:', error);
    }
  }

  /**
   * Get processing statistics
   * @returns {Object} - Processing statistics
   */
  getStatistics() {
    return {
      totalProcessed: this.processedInfo.length,
      successfulProcessing: this.processedInfo.filter(info => info.success).length,
      failedProcessing: this.processedInfo.filter(info => !info.success).length,
      recentProcessing: this.processedInfo.slice(-5),
    };
  }

  /**
   * Close the information processor
   */
  async close() {
    this.processedInfo = [];
    this.isInitialized = false;
    logger.info('Information Processor closed');
  }
}

module.exports = InformationProcessor;
