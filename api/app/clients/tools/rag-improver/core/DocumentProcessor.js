const fs = require('fs-extra');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { logger } = require('@librechat/data-schemas');
const { v4: uuidv4 } = require('uuid');
const GoogleDriveService = require('./GoogleDriveService');

/**
 * Document Processor for RAG System
 * Handles ingestion, processing, and chunking of various document formats
 */
class DocumentProcessor {
  constructor(config) {
    this.config = config.documentProcessing;
    this.fullConfig = config;
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: this.config.chunkSize,
      chunkOverlap: this.config.chunkOverlap,
      separators: ['\n\n', '\n', '. ', ' ', ''],
    });
    this.driveService = new GoogleDriveService(config);
  }

  /**
   * Process a file and return document chunks
   * @param {string} filePath - Path to the file
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Array>} - Array of document chunks
   */
  async processFile(filePath, metadata = {}) {
    try {
      logger.info(`Processing file: ${filePath}`);

      // Validate file
      await this.validateFile(filePath);

      const fileExtension = path.extname(filePath).toLowerCase();
      const filename = path.basename(filePath);
      const stats = await fs.stat(filePath);

      // Extract text based on file type
      let text = '';
      let extractedMetadata = {};

      switch (fileExtension) {
        case '.pdf':
          const result = await this.processPDF(filePath);
          text = result.text;
          extractedMetadata = result.metadata;
          break;

        case '.docx':
          const docResult = await this.processDocx(filePath);
          text = docResult.text;
          extractedMetadata = docResult.metadata;
          break;

        case '.txt':
        case '.md':
          text = await fs.readFile(filePath, 'utf-8');
          break;

        case '.json':
          const jsonContent = await fs.readJson(filePath);
          text = this.jsonToText(jsonContent);
          extractedMetadata = { type: 'json', keys: Object.keys(jsonContent) };
          break;

        default:
          throw new Error(`Unsupported file format: ${fileExtension}`);
      }

      // Clean and normalize text
      text = this.cleanText(text);

      if (!text.trim()) {
        throw new Error('No text content extracted from file');
      }

      // Split text into chunks
      const chunks = await this.textSplitter.splitText(text);

      // Create document objects
      const documents = chunks.map((chunk, index) => ({
        id: uuidv4(),
        content: chunk,
        source: filePath,
        filename: filename,
        content_type: fileExtension.slice(1),
        chunk_index: index,
        total_chunks: chunks.length,
        created_at: new Date().toISOString(),
        file_size: stats.size,
        metadata: {
          ...extractedMetadata,
          ...metadata,
          original_length: text.length,
          chunk_length: chunk.length,
        },
      }));

      logger.info(`Processed ${filename}: ${chunks.length} chunks created`);
      return documents;
    } catch (error) {
      logger.error(`Failed to process file ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Process multiple files in a directory
   * @param {string} directoryPath - Path to directory
   * @param {Object} options - Processing options
   * @returns {Promise<Array>} - Array of all document chunks
   */
  async processDirectory(directoryPath, options = {}) {
    try {
      logger.info(`Processing directory: ${directoryPath}`);

      const { recursive = true, includePatterns = [], excludePatterns = [] } = options;

      const files = await this.findFiles(directoryPath, {
        recursive,
        includePatterns,
        excludePatterns,
      });

      const allDocuments = [];

      for (const filePath of files) {
        try {
          const documents = await this.processFile(filePath);
          allDocuments.push(...documents);
        } catch (error) {
          logger.warn(`Skipping file ${filePath}: ${error.message}`);
        }
      }

      logger.info(`Processed directory: ${allDocuments.length} total chunks from ${files.length} files`);
      return allDocuments;
    } catch (error) {
      logger.error(`Failed to process directory ${directoryPath}:`, error);
      throw error;
    }
  }

  /**
   * Process PDF file
   * @param {string} filePath - Path to PDF file
   * @returns {Promise<Object>} - Extracted text and metadata
   */
  async processPDF(filePath) {
    try {
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdfParse(dataBuffer);

      return {
        text: data.text,
        metadata: {
          pages: data.numpages,
          info: data.info,
          version: data.version,
        },
      };
    } catch (error) {
      logger.error(`Failed to process PDF ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Process DOCX file
   * @param {string} filePath - Path to DOCX file
   * @returns {Promise<Object>} - Extracted text and metadata
   */
  async processDocx(filePath) {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      
      return {
        text: result.value,
        metadata: {
          messages: result.messages,
          hasImages: result.messages.some(msg => msg.type === 'image'),
        },
      };
    } catch (error) {
      logger.error(`Failed to process DOCX ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Convert JSON object to searchable text
   * @param {Object} jsonObj - JSON object
   * @returns {string} - Text representation
   */
  jsonToText(jsonObj) {
    const extractText = (obj, prefix = '') => {
      let text = '';
      
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          text += extractText(value, fullKey);
        } else if (Array.isArray(value)) {
          text += `${fullKey}: ${value.join(', ')}\n`;
        } else {
          text += `${fullKey}: ${value}\n`;
        }
      }
      
      return text;
    };

    return extractText(jsonObj);
  }

  /**
   * Clean and normalize text
   * @param {string} text - Raw text
   * @returns {string} - Cleaned text
   */
  cleanText(text) {
    return text
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n') // Reduce multiple newlines
      .replace(/\t/g, ' ') // Replace tabs with spaces
      .replace(/ {2,}/g, ' ') // Reduce multiple spaces
      .trim();
  }

  /**
   * Validate file before processing
   * @param {string} filePath - Path to file
   */
  async validateFile(filePath) {
    try {
      // Check if file exists
      const exists = await fs.pathExists(filePath);
      if (!exists) {
        throw new Error('File does not exist');
      }

      // Check file size
      const stats = await fs.stat(filePath);
      if (stats.size > this.config.maxFileSize) {
        throw new Error(`File size (${stats.size}) exceeds maximum allowed size (${this.config.maxFileSize})`);
      }

      // Check file extension
      const extension = path.extname(filePath).toLowerCase();
      if (!this.config.supportedFormats.includes(extension)) {
        throw new Error(`Unsupported file format: ${extension}`);
      }

      return true;
    } catch (error) {
      logger.error(`File validation failed for ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Find files in directory
   * @param {string} dirPath - Directory path
   * @param {Object} options - Search options
   * @returns {Promise<Array>} - Array of file paths
   */
  async findFiles(dirPath, options = {}) {
    const { recursive = true, includePatterns = [], excludePatterns = [] } = options;
    const files = [];

    const processDir = async (currentPath) => {
      const items = await fs.readdir(currentPath);

      for (const item of items) {
        const itemPath = path.join(currentPath, item);
        const stats = await fs.stat(itemPath);

        if (stats.isDirectory() && recursive) {
          await processDir(itemPath);
        } else if (stats.isFile()) {
          const extension = path.extname(item).toLowerCase();
          
          // Check supported format
          if (!this.config.supportedFormats.includes(extension)) {
            continue;
          }

          // Check include patterns
          if (includePatterns.length > 0) {
            const matches = includePatterns.some(pattern => 
              new RegExp(pattern).test(item)
            );
            if (!matches) continue;
          }

          // Check exclude patterns
          if (excludePatterns.length > 0) {
            const excluded = excludePatterns.some(pattern => 
              new RegExp(pattern).test(item)
            );
            if (excluded) continue;
          }

          files.push(itemPath);
        }
      }
    };

    await processDir(dirPath);
    return files;
  }

  /**
   * Process all documents from Google Drive "Test Context" folder
   * @param {Object} options - Processing options
   * @returns {Promise<Array>} - Array of document chunks
   */
  async processGoogleDriveDocuments(options = {}) {
    try {
      logger.info('Processing documents from Google Drive "Test Context" folder');

      if (!this.fullConfig.googleDrive.enabled) {
        throw new Error('Google Drive integration is not enabled');
      }

      // Initialize Drive service if not already done
      if (!this.driveService.isInitialized) {
        await this.driveService.initialize();
      }

      // Get all files from the target folder
      const files = await this.driveService.getFilesFromTargetFolder();
      
      if (files.length === 0) {
        logger.warn('No supported files found in Google Drive target folder');
        return [];
      }

      logger.info(`Found ${files.length} files to process from Google Drive`);

      const allDocuments = [];

      for (const file of files) {
        try {
          logger.info(`Processing Google Drive file: ${file.name}`);

          // Extract content from the Drive file
          const extractedDoc = await this.driveService.extractFileContent(file);

          // Clean and validate the content
          if (!extractedDoc.content || extractedDoc.content.trim().length === 0) {
            logger.warn(`Skipping ${file.name}: no extractable content`);
            continue;
          }

          // Clean the text
          const cleanedContent = this.cleanText(extractedDoc.content);

          // Split into chunks
          const chunks = await this.textSplitter.splitText(cleanedContent);

          // Create document objects for each chunk
          const documents = chunks.map((chunk, index) => ({
            id: uuidv4(),
            content: chunk,
            source: 'google_drive',
            filename: extractedDoc.filename,
            content_type: extractedDoc.content_type,
            chunk_index: index,
            total_chunks: chunks.length,
            created_at: extractedDoc.created_at,
            updated_at: extractedDoc.updated_at,
            metadata: {
              ...extractedDoc.metadata,
              original_length: cleanedContent.length,
              chunk_length: chunk.length,
              processed_at: new Date().toISOString(),
              source_type: 'google_drive',
              drive_folder: this.fullConfig.googleDrive.targetFolderName,
            },
          }));

          allDocuments.push(...documents);
          logger.info(`Processed ${file.name}: ${chunks.length} chunks created`);

        } catch (error) {
          logger.warn(`Failed to process Google Drive file ${file.name}:`, error.message);
          // Continue processing other files
        }
      }

      logger.info(`Google Drive processing complete: ${allDocuments.length} total chunks from ${files.length} files`);
      return allDocuments;

    } catch (error) {
      logger.error('Failed to process Google Drive documents:', error);
      throw error;
    }
  }

  /**
   * Update document content and re-chunk if necessary
   * @param {Object} document - Original document
   * @param {string} newContent - Updated content
   * @returns {Promise<Array>} - Updated document chunks
   */
  async updateDocument(document, newContent) {
    try {
      logger.info(`Updating document: ${document.filename}`);

      // Clean new content
      const cleanedContent = this.cleanText(newContent);

      // Re-chunk the content
      const chunks = await this.textSplitter.splitText(cleanedContent);

      // Create updated document objects
      const updatedDocuments = chunks.map((chunk, index) => ({
        ...document,
        id: index === 0 ? document.id : uuidv4(), // Keep original ID for first chunk
        content: chunk,
        chunk_index: index,
        total_chunks: chunks.length,
        updated_at: new Date().toISOString(),
        metadata: {
          ...document.metadata,
          original_length: cleanedContent.length,
          chunk_length: chunk.length,
          update_reason: 'content_updated',
        },
      }));

      logger.info(`Updated document ${document.filename}: ${chunks.length} chunks`);
      return updatedDocuments;
    } catch (error) {
      logger.error(`Failed to update document ${document.filename}:`, error);
      throw error;
    }
  }
}

module.exports = DocumentProcessor;
