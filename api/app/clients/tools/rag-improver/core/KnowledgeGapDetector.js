const { ChatOpenAI } = require('@langchain/openai');
const { logger } = require('@librechat/data-schemas');
const fs = require('fs-extra');
const path = require('path');

/**
 * Knowledge Gap Detector
 * Analyzes queries and retrieved documents to identify knowledge gaps
 */
class KnowledgeGapDetector {
  constructor(config) {
    this.config = config;
    this.llm = null;
    this.gapHistory = [];
    this.isInitialized = false;
  }

  /**
   * Initialize the knowledge gap detector
   */
  async initialize() {
    try {
      logger.info('Initializing Knowledge Gap Detector...');

      this.llm = new ChatOpenAI({
        openAIApiKey: this.config.openai.apiKey,
        modelName: this.config.openai.model,
        maxTokens: 2000,
        temperature: 0.1, // Low temperature for consistent analysis
      });

      // Ensure log directory exists
      await fs.ensureDir(this.config.logging.logDirectory);

      this.isInitialized = true;
      logger.info('Knowledge Gap Detector initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Knowledge Gap Detector:', error);
      throw error;
    }
  }

  /**
   * Analyze a query and retrieved documents for knowledge gaps
   * @param {string} query - User query
   * @param {Array} retrievedDocs - Retrieved documents from vector search
   * @returns {Promise<Object>} - Gap analysis result
   */
  async analyzeKnowledgeGap(query, retrievedDocs) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      logger.debug(`Analyzing knowledge gap for query: "${query}"`);

      // Quick checks for obvious gaps
      const quickGapCheck = this.performQuickGapCheck(query, retrievedDocs);
      if (quickGapCheck.hasGap) {
        return quickGapCheck;
      }

      // Detailed LLM-based analysis
      const detailedAnalysis = await this.performDetailedGapAnalysis(query, retrievedDocs);

      // Combine results and add metadata
      const finalAnalysis = {
        ...detailedAnalysis,
        retrievedDocsCount: retrievedDocs.length,
        avgSimilarity: retrievedDocs.length > 0 
          ? retrievedDocs.reduce((sum, doc) => sum + doc.similarity, 0) / retrievedDocs.length 
          : 0,
        analysisTimestamp: new Date().toISOString(),
      };

      // Store gap analysis for learning
      await this.recordGapAnalysis(query, finalAnalysis);

      return finalAnalysis;
    } catch (error) {
      logger.error('Failed to analyze knowledge gap:', error);
      
      // Return safe fallback
      return {
        hasGap: false,
        confidence: 0.5,
        gapType: 'analysis_error',
        missingInfo: 'Unable to analyze knowledge gap',
        suggestedQueries: [],
        expertContactNeeded: false,
      };
    }
  }

  /**
   * Perform quick gap check without LLM
   * @param {string} query - User query
   * @param {Array} retrievedDocs - Retrieved documents
   * @returns {Object} - Quick gap analysis
   */
  performQuickGapCheck(query, retrievedDocs) {
    // No documents found
    if (retrievedDocs.length === 0) {
      return {
        hasGap: true,
        confidence: 0.95,
        gapType: 'no_documents',
        missingInfo: 'No relevant documents found in the knowledge base',
        suggestedQueries: this.generateSuggestedQueries(query),
        expertContactNeeded: true,
        quickCheck: true,
      };
    }

    // Very low similarity scores
    const maxSimilarity = Math.max(...retrievedDocs.map(doc => doc.similarity));
    if (maxSimilarity < this.config.knowledgeGap.similarityThreshold) {
      return {
        hasGap: true,
        confidence: 0.8,
        gapType: 'low_relevance',
        missingInfo: 'Retrieved documents have low relevance to the query',
        suggestedQueries: this.generateSuggestedQueries(query),
        expertContactNeeded: true,
        quickCheck: true,
      };
    }

    // Check for date-sensitive queries with old documents
    if (this.isDateSensitiveQuery(query)) {
      const hasRecentDocs = retrievedDocs.some(doc => 
        this.isDocumentRecent(doc.metadata.created_at || doc.metadata.updated_at)
      );
      
      if (!hasRecentDocs) {
        return {
          hasGap: true,
          confidence: 0.75,
          gapType: 'outdated_info',
          missingInfo: 'Query requires recent information but only old documents were found',
          suggestedQueries: [`Recent ${query}`, `Latest ${query}`, `Current ${query}`],
          expertContactNeeded: true,
          quickCheck: true,
        };
      }
    }

    // No obvious gaps found
    return {
      hasGap: false,
      confidence: 0.8,
      quickCheck: true,
    };
  }

  /**
   * Perform detailed LLM-based gap analysis
   * @param {string} query - User query
   * @param {Array} retrievedDocs - Retrieved documents
   * @returns {Promise<Object>} - Detailed gap analysis
   */
  async performDetailedGapAnalysis(query, retrievedDocs) {
    try {
      // Prepare context from retrieved documents
      const context = retrievedDocs.map((doc, index) => 
        `Document ${index + 1} (Similarity: ${doc.similarity.toFixed(3)}):
${doc.content}
---`
      ).join('\n');

      const prompt = `${this.config.knowledgeGap.gapDetectionPrompt}

User Query: "${query}"

Retrieved Documents:
${context || 'No documents retrieved.'}

Please analyze whether the retrieved documents provide sufficient information to fully answer the user's query. Consider:
1. Completeness of information
2. Relevance to the specific question
3. Currency of information (if relevant)
4. Clarity and specificity of the query

Respond with a valid JSON object only.`;

      const response = await this.llm.invoke([
        ['user', prompt]
      ]);

      // Parse the JSON response
      const analysis = this.parseGapAnalysisResponse(response.content);
      
      return {
        ...analysis,
        detailedAnalysis: true,
      };
    } catch (error) {
      logger.error('Failed to perform detailed gap analysis:', error);
      
      // Fallback analysis
      return {
        hasGap: retrievedDocs.length === 0,
        confidence: 0.5,
        gapType: 'analysis_error',
        missingInfo: 'Could not perform detailed analysis',
        suggestedQueries: this.generateSuggestedQueries(query),
        expertContactNeeded: false,
        detailedAnalysis: false,
      };
    }
  }

  /**
   * Parse the gap analysis response from LLM
   * @param {string} response - LLM response
   * @returns {Object} - Parsed analysis
   */
  parseGapAnalysisResponse(response) {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const analysis = JSON.parse(jsonMatch[0]);

      // Validate required fields
      const requiredFields = ['hasGap', 'confidence', 'gapType'];
      for (const field of requiredFields) {
        if (!(field in analysis)) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      // Normalize and validate values
      return {
        hasGap: Boolean(analysis.hasGap),
        confidence: Math.max(0, Math.min(1, Number(analysis.confidence) || 0.5)),
        gapType: String(analysis.gapType || 'unknown'),
        missingInfo: String(analysis.missingInfo || 'No specific information provided'),
        suggestedQueries: Array.isArray(analysis.suggestedQueries) 
          ? analysis.suggestedQueries.slice(0, 5) 
          : [],
        expertContactNeeded: Boolean(analysis.expertContactNeeded),
      };
    } catch (error) {
      logger.error('Failed to parse gap analysis response:', error);
      
      // Return safe defaults
      return {
        hasGap: false,
        confidence: 0.5,
        gapType: 'parse_error',
        missingInfo: 'Could not parse analysis results',
        suggestedQueries: [],
        expertContactNeeded: false,
      };
    }
  }

  /**
   * Check if a query is date-sensitive
   * @param {string} query - User query
   * @returns {boolean} - True if query is date-sensitive
   */
  isDateSensitiveQuery(query) {
    const dateSensitiveKeywords = [
      'current', 'latest', 'recent', 'now', 'today', 'this year', 'new',
      'updated', 'changes', 'status', 'active', 'available', 'open',
    ];

    const queryLower = query.toLowerCase();
    return dateSensitiveKeywords.some(keyword => queryLower.includes(keyword));
  }

  /**
   * Check if a document is recent (within last 6 months)
   * @param {string} dateString - Date string
   * @returns {boolean} - True if document is recent
   */
  isDocumentRecent(dateString) {
    if (!dateString) return false;
    
    try {
      const docDate = new Date(dateString);
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      return docDate > sixMonthsAgo;
    } catch {
      return false;
    }
  }

  /**
   * Generate suggested queries based on the original query
   * @param {string} query - Original query
   * @returns {Array} - Suggested alternative queries
   */
  generateSuggestedQueries(query) {
    const suggestions = [];
    
    // Add more specific queries
    suggestions.push(`${query} policy`);
    suggestions.push(`${query} procedure`);
    suggestions.push(`${query} guide`);
    
    // Add broader queries
    const words = query.split(' ');
    if (words.length > 2) {
      suggestions.push(words.slice(0, -1).join(' '));
    }
    
    // Add department-specific variations
    const departments = ['HR', 'IT', 'Admin', 'Finance'];
    departments.forEach(dept => {
      suggestions.push(`${dept} ${query}`);
    });

    return suggestions.slice(0, 5); // Limit to 5 suggestions
  }

  /**
   * Record gap analysis for learning and improvement
   * @param {string} query - Original query
   * @param {Object} analysis - Gap analysis result
   */
  async recordGapAnalysis(query, analysis) {
    try {
      const record = {
        id: require('uuid').v4(),
        query: query,
        analysis: analysis,
        timestamp: new Date().toISOString(),
      };

      // Add to in-memory history (limited size)
      this.gapHistory.push(record);
      if (this.gapHistory.length > 1000) {
        this.gapHistory.shift(); // Remove oldest
      }

      // Log to file for persistent storage
      const logFile = path.join(this.config.logging.logDirectory, 'gap_analysis.jsonl');
      await fs.appendFile(logFile, JSON.stringify(record) + '\n');

      logger.debug(`Recorded gap analysis for query: "${query}"`);
    } catch (error) {
      logger.error('Failed to record gap analysis:', error);
      // Don't throw - recording failures shouldn't break the main flow
    }
  }

  /**
   * Get gap analysis statistics
   * @returns {Promise<Object>} - Statistics about knowledge gaps
   */
  async getStatistics() {
    try {
      const stats = {
        totalAnalyses: this.gapHistory.length,
        gapsDetected: this.gapHistory.filter(record => record.analysis.hasGap).length,
        gapTypes: {},
        avgConfidence: 0,
        recentAnalyses: this.gapHistory.slice(-10),
      };

      // Calculate gap type distribution
      this.gapHistory.forEach(record => {
        if (record.analysis.hasGap) {
          const type = record.analysis.gapType;
          stats.gapTypes[type] = (stats.gapTypes[type] || 0) + 1;
        }
      });

      // Calculate average confidence
      if (this.gapHistory.length > 0) {
        const totalConfidence = this.gapHistory.reduce(
          (sum, record) => sum + record.analysis.confidence, 0
        );
        stats.avgConfidence = totalConfidence / this.gapHistory.length;
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get gap analysis statistics:', error);
      return { error: 'Failed to get statistics' };
    }
  }

  /**
   * Close the knowledge gap detector
   */
  async close() {
    this.isInitialized = false;
    logger.info('Knowledge Gap Detector closed');
  }
}

module.exports = KnowledgeGapDetector;
