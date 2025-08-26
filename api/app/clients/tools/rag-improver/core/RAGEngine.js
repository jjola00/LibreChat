const { ChatOpenAI } = require('@langchain/openai');
const { logger } = require('@librechat/data-schemas');
const VectorDatabase = require('./VectorDatabase');
const DocumentProcessor = require('./DocumentProcessor');
const KnowledgeGapDetector = require('./KnowledgeGapDetector');
const { v4: uuidv4 } = require('uuid');

/**
 * Core RAG Engine that orchestrates retrieval, generation, and self-improvement
 */
class RAGEngine {
  constructor(config) {
    this.config = config;
    this.vectorDB = new VectorDatabase(config);
    this.documentProcessor = new DocumentProcessor(config);
    this.gapDetector = new KnowledgeGapDetector(config);
    this.llm = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the RAG engine
   */
  async initialize() {
    try {
      logger.info('Initializing RAG Engine...');

      // Initialize LLM
      this.llm = new ChatOpenAI({
        openAIApiKey: this.config.openai.apiKey,
        modelName: this.config.openai.model,
        maxTokens: this.config.openai.maxTokens,
        temperature: this.config.openai.temperature,
      });

      // Initialize components
      await this.vectorDB.initialize();
      await this.gapDetector.initialize();

      this.isInitialized = true;
      logger.info('RAG Engine initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize RAG Engine:', error);
      throw error;
    }
  }

  /**
   * Process and ingest documents into the knowledge base
   * @param {string|Array} source - File path, directory path, or array of documents
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} - Ingestion results
   */
  async ingestDocuments(source, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      logger.info(`Ingesting documents from: ${source}`);

      let documents = [];

      if (Array.isArray(source)) {
        // Already processed documents
        documents = source;
      } else if (typeof source === 'string') {
        const fs = require('fs-extra');
        const stats = await fs.stat(source);

        if (stats.isDirectory()) {
          documents = await this.documentProcessor.processDirectory(source, options);
        } else {
          documents = await this.documentProcessor.processFile(source, options.metadata);
        }
      } else {
        throw new Error('Invalid source type. Must be string path or array of documents');
      }

      // Add documents to vector database
      const docIds = await this.vectorDB.addDocuments(documents);

      const result = {
        success: true,
        documentsProcessed: documents.length,
        documentIds: docIds,
        source: source,
        timestamp: new Date().toISOString(),
      };

      logger.info(`Successfully ingested ${documents.length} document chunks`);
      return result;
    } catch (error) {
      logger.error('Failed to ingest documents:', error);
      throw error;
    }
  }

  /**
   * Query the knowledge base and generate a response
   * @param {string} query - User query
   * @param {Object} options - Query options
   * @returns {Promise<Object>} - Query response with metadata
   */
  async query(query, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      logger.info(`Processing query: "${query}"`);

      const {
        maxResults = 5,
        threshold = 0.7,
        includeGapDetection = true,
        userId = null,
        conversationId = null,
      } = options;

      const startTime = Date.now();

      // 1. Retrieve relevant documents
      const retrievedDocs = await this.vectorDB.search(query, {
        numResults: maxResults,
        threshold: threshold,
      });

      logger.debug(`Retrieved ${retrievedDocs.length} relevant documents`);

      // 2. Check for knowledge gaps
      let gapAnalysis = null;
      if (includeGapDetection) {
        gapAnalysis = await this.gapDetector.analyzeKnowledgeGap(query, retrievedDocs);
        logger.debug(`Knowledge gap analysis: hasGap=${gapAnalysis.hasGap}, confidence=${gapAnalysis.confidence}`);
      }

      // 3. Generate response
      const response = await this.generateResponse(query, retrievedDocs, gapAnalysis);

      // 4. Prepare result
      const result = {
        query: query,
        response: response.text,
        confidence: response.confidence,
        sources: retrievedDocs.map(doc => ({
          id: doc.id,
          filename: doc.metadata.filename,
          similarity: doc.similarity,
          excerpt: doc.content.substring(0, 200) + '...',
        })),
        knowledgeGap: gapAnalysis,
        metadata: {
          retrievedDocs: retrievedDocs.length,
          processingTime: Date.now() - startTime,
          userId: userId,
          conversationId: conversationId,
          timestamp: new Date().toISOString(),
        },
      };

      // 5. Log the query for analysis
      await this.logQuery(result);

      logger.info(`Query processed successfully in ${result.metadata.processingTime}ms`);
      return result;
    } catch (error) {
      logger.error('Failed to process query:', error);
      throw error;
    }
  }

  /**
   * Generate response using LLM with retrieved context
   * @param {string} query - User query
   * @param {Array} retrievedDocs - Retrieved documents
   * @param {Object} gapAnalysis - Knowledge gap analysis
   * @returns {Promise<Object>} - Generated response
   */
  async generateResponse(query, retrievedDocs, gapAnalysis) {
    try {
      // Prepare context from retrieved documents
      const context = retrievedDocs.map((doc, index) => {
        return `[Source ${index + 1}: ${doc.metadata.filename}]
${doc.content}
`;
      }).join('\n');

      // Build prompt based on gap analysis
      let systemPrompt = '';
      let userPrompt = '';

      if (gapAnalysis && gapAnalysis.hasGap) {
        systemPrompt = `You are a helpful assistant for Dogpatch Labs. You have access to the company's knowledge base, but some information may be missing or incomplete for the user's query.

Guidelines:
- Use the provided context to answer what you can
- Clearly indicate what information is missing or uncertain
- Suggest how the user might get complete information
- Be honest about limitations in your knowledge
- If no relevant information is found, acknowledge this and suggest next steps`;

        userPrompt = `Context from knowledge base:
${context || 'No relevant documents found in the knowledge base.'}

Knowledge Gap Analysis:
- Gap Type: ${gapAnalysis.gapType}
- Missing Information: ${gapAnalysis.missingInfo}
- Confidence: ${gapAnalysis.confidence}

User Question: ${query}

Please provide the best answer you can with the available information, and clearly indicate what information is missing or where the user should look for complete answers.`;
      } else {
        systemPrompt = `You are a helpful assistant for Dogpatch Labs with access to the company's knowledge base. Use the provided context to answer the user's question accurately and comprehensively.

Guidelines:
- Base your answer primarily on the provided context
- Be specific and cite relevant information
- If the context doesn't fully answer the question, say so
- Maintain a helpful and professional tone`;

        userPrompt = `Context from knowledge base:
${context}

User Question: ${query}

Please provide a comprehensive answer based on the context provided.`;
      }

      // Generate response
      const response = await this.llm.invoke([
        ['system', systemPrompt],
        ['user', userPrompt],
      ]);

      // Calculate confidence based on retrieved docs and gap analysis
      let confidence = 0.5; // Default confidence
      if (retrievedDocs.length > 0) {
        const avgSimilarity = retrievedDocs.reduce((sum, doc) => sum + doc.similarity, 0) / retrievedDocs.length;
        confidence = Math.min(avgSimilarity * 0.9, 0.95); // Cap at 95%
      }

      if (gapAnalysis && gapAnalysis.hasGap) {
        confidence *= gapAnalysis.confidence; // Reduce confidence if there are gaps
      }

      return {
        text: response.content,
        confidence: confidence,
        usedContext: context.length > 0,
        contextLength: context.length,
      };
    } catch (error) {
      logger.error('Failed to generate response:', error);
      throw error;
    }
  }

  /**
   * Update a document in the knowledge base
   * @param {string} documentId - Document ID
   * @param {string} newContent - New content
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} - Update result
   */
  async updateDocument(documentId, newContent, metadata = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      logger.info(`Updating document: ${documentId}`);

      // Update in vector database
      await this.vectorDB.updateDocument(documentId, {
        content: newContent,
        metadata: {
          ...metadata,
          updated_at: new Date().toISOString(),
          update_reason: 'manual_update',
        },
      });

      const result = {
        success: true,
        documentId: documentId,
        timestamp: new Date().toISOString(),
      };

      logger.info(`Successfully updated document: ${documentId}`);
      return result;
    } catch (error) {
      logger.error(`Failed to update document ${documentId}:`, error);
      throw error;
    }
  }

  /**
   * Get knowledge base statistics
   * @returns {Promise<Object>} - Statistics
   */
  async getStatistics() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const vectorStats = await this.vectorDB.getStatistics();
      const gapStats = await this.gapDetector.getStatistics();

      return {
        vectorDatabase: vectorStats,
        knowledgeGaps: gapStats,
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to get statistics:', error);
      throw error;
    }
  }

  /**
   * Log query for analysis and improvement
   * @param {Object} queryResult - Query result to log
   */
  async logQuery(queryResult) {
    try {
      // Implementation depends on logging configuration
      // For now, just log to console/file
      logger.info('Query logged', {
        query: queryResult.query,
        confidence: queryResult.confidence,
        hasGap: queryResult.knowledgeGap?.hasGap,
        retrievedDocs: queryResult.metadata.retrievedDocs,
        processingTime: queryResult.metadata.processingTime,
      });

      // TODO: Store in database for analysis
    } catch (error) {
      logger.error('Failed to log query:', error);
      // Don't throw - logging failures shouldn't break the main flow
    }
  }

  /**
   * Cleanup and close connections
   */
  async close() {
    if (this.vectorDB) {
      await this.vectorDB.close();
    }
    if (this.gapDetector) {
      await this.gapDetector.close();
    }
    this.isInitialized = false;
    logger.info('RAG Engine closed');
  }
}

module.exports = RAGEngine;
