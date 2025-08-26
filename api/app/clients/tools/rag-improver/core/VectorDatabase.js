const { ChromaClient } = require('chromadb');
const { OpenAIEmbeddings } = require('@langchain/openai');
const { logger } = require('@librechat/data-schemas');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs-extra');
const path = require('path');

/**
 * Vector Database Manager for Self-Improving RAG
 * Handles document embeddings, storage, and retrieval
 */
class VectorDatabase {
  constructor(config) {
    this.config = config.vectorDB;
    this.openaiConfig = config.openai;
    this.client = null;
    this.collection = null;
    this.embeddings = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the vector database connection and embeddings
   */
  async initialize() {
    try {
      logger.info('Initializing Vector Database...');

      // Initialize OpenAI embeddings
      this.embeddings = new OpenAIEmbeddings({
        openAIApiKey: this.openaiConfig.apiKey,
        modelName: this.openaiConfig.embeddingModel,
        batchSize: 512,
        stripNewLines: true,
      });

      // Initialize Chroma client
      this.client = new ChromaClient({
        path: this.config.chromaUrl,
      });

      // Ensure persist directory exists
      await fs.ensureDir(this.config.persistDirectory);

      // Get or create collection
      try {
        this.collection = await this.client.getCollection({
          name: this.config.collection,
        });
        logger.info(`Connected to existing collection: ${this.config.collection}`);
      } catch (error) {
        logger.info(`Creating new collection: ${this.config.collection}`);
        this.collection = await this.client.createCollection({
          name: this.config.collection,
          metadata: {
            description: 'Dogpatch Labs Knowledge Base',
            created_at: new Date().toISOString(),
            version: '1.0',
          },
        });
      }

      this.isInitialized = true;
      logger.info('Vector Database initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Vector Database:', error);
      throw error;
    }
  }

  /**
   * Add documents to the vector database
   * @param {Array} documents - Array of document objects
   * @returns {Promise<Array>} - Array of document IDs
   */
  async addDocuments(documents) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      logger.info(`Adding ${documents.length} documents to vector database`);

      const docIds = [];
      const embeddings = [];
      const metadatas = [];
      const texts = [];

      for (const doc of documents) {
        const docId = doc.id || uuidv4();
        docIds.push(docId);

        // Generate embedding for the document
        const embedding = await this.embeddings.embedQuery(doc.content);
        embeddings.push(embedding);

        // Prepare metadata (convert arrays to strings for ChromaDB compatibility)
        const metadata = {
          source: doc.source || 'unknown',
          filename: doc.filename || 'unknown',
          content_type: doc.content_type || 'text',
          created_at: doc.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          chunk_index: doc.chunk_index || 0,
          total_chunks: doc.total_chunks || 1,
          confidence_score: doc.confidence_score || 1.0,
        };

        // Add other metadata, converting arrays to strings
        if (doc.metadata) {
          for (const [key, value] of Object.entries(doc.metadata)) {
            if (Array.isArray(value)) {
              metadata[key] = value.join(', ');
            } else if (value !== null && value !== undefined) {
              metadata[key] = String(value);
            }
          }
        }
        metadatas.push(metadata);

        texts.push(doc.content);
      }

      // Add to Chroma collection
      await this.collection.add({
        ids: docIds,
        embeddings: embeddings,
        metadatas: metadatas,
        documents: texts,
      });

      logger.info(`Successfully added ${docIds.length} documents`);
      return docIds;
    } catch (error) {
      logger.error('Failed to add documents to vector database:', error);
      throw error;
    }
  }

  /**
   * Search for similar documents
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Array>} - Array of search results
   */
  async search(query, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const {
        numResults = this.config.maxRetrievedDocs || 5,
        threshold = 0.7,
        filters = {},
        includeMetadata = true,
      } = options;

      logger.debug(`Searching vector database for: "${query}"`);

      // Generate query embedding
      const queryEmbedding = await this.embeddings.embedQuery(query);

      // Search in Chroma
      const results = await this.collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: numResults,
        where: Object.keys(filters).length > 0 ? filters : undefined,
        include: ['documents', 'metadatas', 'distances'],
      });

      // Process and format results
      const formattedResults = [];
      if (results.documents && results.documents[0]) {
        for (let i = 0; i < results.documents[0].length; i++) {
          const distance = results.distances[0][i];
          const similarity = 1 - distance; // Convert distance to similarity

          if (similarity >= threshold) {
            formattedResults.push({
              id: results.ids[0][i],
              content: results.documents[0][i],
              metadata: includeMetadata ? results.metadatas[0][i] : {},
              similarity: similarity,
              distance: distance,
            });
          }
        }
      }

      logger.debug(`Found ${formattedResults.length} relevant documents`);
      return formattedResults;
    } catch (error) {
      logger.error('Failed to search vector database:', error);
      throw error;
    }
  }

  /**
   * Update a document in the vector database
   * @param {string} docId - Document ID
   * @param {Object} updates - Updates to apply
   */
  async updateDocument(docId, updates) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      logger.info(`Updating document: ${docId}`);

      // Get existing document
      const existing = await this.collection.get({
        ids: [docId],
        include: ['documents', 'metadatas'],
      });

      if (!existing.documents || existing.documents.length === 0) {
        throw new Error(`Document ${docId} not found`);
      }

      const existingDoc = existing.documents[0];
      const existingMetadata = existing.metadatas[0];

      // Prepare updates
      const newContent = updates.content || existingDoc;
      const newMetadata = {
        ...existingMetadata,
        ...updates.metadata,
        updated_at: new Date().toISOString(),
      };

      let newEmbedding;
      if (updates.content) {
        newEmbedding = await this.embeddings.embedQuery(newContent);
      }

      // Update in Chroma
      const updateData = {
        ids: [docId],
        documents: [newContent],
        metadatas: [newMetadata],
      };

      if (newEmbedding) {
        updateData.embeddings = [newEmbedding];
      }

      await this.collection.update(updateData);

      logger.info(`Successfully updated document: ${docId}`);
    } catch (error) {
      logger.error(`Failed to update document ${docId}:`, error);
      throw error;
    }
  }

  /**
   * Delete documents from the vector database
   * @param {Array<string>} docIds - Array of document IDs to delete
   */
  async deleteDocuments(docIds) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      logger.info(`Deleting ${docIds.length} documents`);

      await this.collection.delete({
        ids: docIds,
      });

      logger.info(`Successfully deleted ${docIds.length} documents`);
    } catch (error) {
      logger.error('Failed to delete documents:', error);
      throw error;
    }
  }

  /**
   * Get collection statistics
   * @returns {Promise<Object>} - Collection statistics
   */
  async getStatistics() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const count = await this.collection.count();
      
      return {
        totalDocuments: count,
        collectionName: this.config.collection,
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to get collection statistics:', error);
      throw error;
    }
  }

  /**
   * Backup the vector database
   * @param {string} backupPath - Path to store backup
   */
  async backup(backupPath) {
    try {
      logger.info(`Creating vector database backup at: ${backupPath}`);

      // Get all documents
      const allDocs = await this.collection.get({
        include: ['documents', 'metadatas', 'embeddings'],
      });

      const backupData = {
        collection_name: this.config.collection,
        created_at: new Date().toISOString(),
        documents: allDocs.documents,
        metadatas: allDocs.metadatas,
        embeddings: allDocs.embeddings,
        ids: allDocs.ids,
      };

      await fs.ensureDir(path.dirname(backupPath));
      await fs.writeJson(backupPath, backupData, { spaces: 2 });

      logger.info('Vector database backup completed successfully');
    } catch (error) {
      logger.error('Failed to backup vector database:', error);
      throw error;
    }
  }

  /**
   * Close the database connection
   */
  async close() {
    if (this.client) {
      // Chroma client doesn't have explicit close method
      this.client = null;
      this.collection = null;
      this.isInitialized = false;
      logger.info('Vector database connection closed');
    }
  }
}

module.exports = VectorDatabase;
