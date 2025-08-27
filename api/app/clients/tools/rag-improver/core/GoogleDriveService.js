const { google } = require('googleapis');
const { logger } = require('@librechat/data-schemas');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

/**
 * Google Drive Service for RAG System
 * Handles authentication, folder discovery, and document extraction from Google Drive
 */
class GoogleDriveService {
  constructor(config) {
    this.config = config.googleDrive;
    this.auth = null;
    this.drive = null;
    this.docs = null;
    this.sheets = null;
    this.slides = null;
    this.folderCache = new Map();
    this.isInitialized = false;
  }

  /**
   * Initialize Google Drive service with authentication
   */
  async initialize() {
    try {
      logger.info('Initializing Google Drive Service...');

      if (!this.config.enabled) {
        logger.info('Google Drive integration is disabled');
        return;
      }

      // Validate credentials file exists
      if (!await fs.pathExists(this.config.credentialsPath)) {
        throw new Error(`Google Drive credentials file not found: ${this.config.credentialsPath}`);
      }

      // Load service account credentials
      const credentials = await this.loadCredentials();
      
      // Create JWT client
      this.auth = new google.auth.JWT(
        credentials.client_email,
        null,
        credentials.private_key,
        this.config.scopes
      );

      // Authenticate
      await this.auth.authorize();

      // Initialize Google APIs
      this.drive = google.drive({ version: 'v3', auth: this.auth });
      this.docs = google.docs({ version: 'v1', auth: this.auth });
      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      this.slides = google.slides({ version: 'v1', auth: this.auth });

      // Load folder cache
      await this.loadFolderCache();

      this.isInitialized = true;
      logger.info('Google Drive Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Google Drive Service:', error);
      throw error;
    }
  }

  /**
   * Load and validate Google service account credentials
   * @returns {Object} - Service account credentials
   */
  async loadCredentials() {
    try {
      // Never log credentials for security
      logger.debug('Loading Google Drive credentials from secure path');
      
      const credentialsContent = await fs.readFile(this.config.credentialsPath, 'utf8');
      const credentials = JSON.parse(credentialsContent);

      // Validate required fields
      const requiredFields = ['client_email', 'private_key', 'project_id'];
      for (const field of requiredFields) {
        if (!credentials[field]) {
          throw new Error(`Missing required credential field: ${field}`);
        }
      }

      logger.info('Google Drive credentials loaded successfully');
      return credentials;
    } catch (error) {
      logger.error('Failed to load Google Drive credentials:', error);
      throw new Error('Invalid or missing Google Drive credentials');
    }
  }

  /**
   * Discover and cache the target folder ID
   * @returns {Promise<string>} - Folder ID
   */
  async findTargetFolder() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // If folder ID is directly provided, use it
      if (this.config.targetFolderId) {
        logger.info(`Using provided folder ID: ${this.config.targetFolderId}`);
        return this.config.targetFolderId;
      }

      // Must have folder name if no ID provided
      if (!this.config.targetFolderName) {
        throw new Error('Either targetFolderId or targetFolderName must be configured');
      }

      // Check cache first
      const cacheKey = this.config.targetFolderName;
      if (this.folderCache.has(cacheKey)) {
        const cached = this.folderCache.get(cacheKey);
        logger.debug(`Using cached folder ID for "${cacheKey}": ${cached.id}`);
        return cached.id;
      }

      logger.info(`Searching for folder: "${this.config.targetFolderName}"`);

      // Search for folder by name
      const response = await this.drive.files.list({
        q: `name='${this.config.targetFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name, createdTime, modifiedTime)',
        spaces: 'drive',
      });

      if (!response.data.files || response.data.files.length === 0) {
        throw new Error(`Folder "${this.config.targetFolderName}" not found or not accessible`);
      }

      if (response.data.files.length > 1) {
        logger.warn(`Multiple folders found with name "${this.config.targetFolderName}", using the first one`);
      }

      const folder = response.data.files[0];
      
      // Cache the folder information
      const folderInfo = {
        id: folder.id,
        name: folder.name,
        createdTime: folder.createdTime,
        modifiedTime: folder.modifiedTime,
        cachedAt: new Date().toISOString(),
      };

      this.folderCache.set(cacheKey, folderInfo);
      await this.saveFolderCache();

      logger.info(`Found target folder "${this.config.targetFolderName}" (ID: ${folder.id})`);
      return folder.id;
    } catch (error) {
      logger.error(`Failed to find target folder:`, error);
      throw error;
    }
  }

  /**
   * Get all files from the target folder
   * @returns {Promise<Array>} - Array of file metadata
   */
  async getFilesFromTargetFolder() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const folderId = await this.findTargetFolder();
      
      logger.info(`Retrieving files from folder: ${folderId}`);

      const files = [];
      let pageToken = null;

      do {
        const response = await this.drive.files.list({
          q: `'${folderId}' in parents and trashed=false`,
          fields: 'nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink)',
          pageToken: pageToken,
          pageSize: 100,
        });

        if (response.data.files) {
          // Filter to supported file types
          const supportedFiles = response.data.files.filter(file => 
            this.config.supportedMimeTypes.includes(file.mimeType)
          );
          
          files.push(...supportedFiles);
        }

        pageToken = response.data.nextPageToken;
      } while (pageToken);

      logger.info(`Found ${files.length} supported files in target folder`);
      return files;
    } catch (error) {
      logger.error('Failed to get files from target folder:', error);
      throw error;
    }
  }

  /**
   * Extract text content from a Google Drive file
   * @param {Object} file - File metadata from Drive API
   * @returns {Promise<Object>} - Extracted content and metadata
   */
  async extractFileContent(file) {
    try {
      logger.debug(`Extracting content from: ${file.name} (${file.mimeType})`);

      let content = '';
      let extractedMetadata = {};

      switch (file.mimeType) {
        case 'application/vnd.google-apps.document':
          const docResult = await this.extractGoogleDocContent(file.id);
          content = docResult.content;
          extractedMetadata = docResult.metadata;
          break;

        case 'application/vnd.google-apps.spreadsheet':
          const sheetResult = await this.extractGoogleSheetContent(file.id);
          content = sheetResult.content;
          extractedMetadata = sheetResult.metadata;
          break;

        case 'application/vnd.google-apps.presentation':
          const slideResult = await this.extractGoogleSlidesContent(file.id);
          content = slideResult.content;
          extractedMetadata = slideResult.metadata;
          break;

        case 'application/pdf':
        case 'text/plain':
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
          const binaryResult = await this.extractBinaryFileContent(file);
          content = binaryResult.content;
          extractedMetadata = binaryResult.metadata;
          break;

        default:
          throw new Error(`Unsupported file type: ${file.mimeType}`);
      }

      return {
        id: uuidv4(),
        content: content.trim(),
        source: 'google_drive',
        filename: file.name,
        content_type: this.getContentTypeFromMimeType(file.mimeType),
        created_at: file.createdTime,
        updated_at: file.modifiedTime,
        metadata: {
          ...extractedMetadata,
          drive_file_id: file.id,
          mime_type: file.mimeType,
          file_size: file.size,
          web_view_link: file.webViewLink,
          extracted_at: new Date().toISOString(),
          extraction_source: 'google_drive',
        },
      };
    } catch (error) {
      logger.error(`Failed to extract content from ${file.name}:`, error);
      throw error;
    }
  }

  /**
   * Extract content from Google Docs
   * @param {string} fileId - Google Docs file ID
   * @returns {Promise<Object>} - Extracted content and metadata
   */
  async extractGoogleDocContent(fileId) {
    try {
      const response = await this.docs.documents.get({
        documentId: fileId,
      });

      const doc = response.data;
      let content = '';

      if (doc.body && doc.body.content) {
        content = this.extractTextFromDocElements(doc.body.content);
      }

      return {
        content: content,
        metadata: {
          title: doc.title,
          document_id: doc.documentId,
          revision_id: doc.revisionId,
        },
      };
    } catch (error) {
      logger.error(`Failed to extract Google Docs content for ${fileId}:`, error);
      throw error;
    }
  }

  /**
   * Extract content from Google Sheets
   * @param {string} fileId - Google Sheets file ID
   * @returns {Promise<Object>} - Extracted content and metadata
   */
  async extractGoogleSheetContent(fileId) {
    try {
      // Get spreadsheet metadata
      const metadataResponse = await this.sheets.spreadsheets.get({
        spreadsheetId: fileId,
      });

      const spreadsheet = metadataResponse.data;
      let content = '';
      const sheetNames = [];

      // Extract content from each sheet
      for (const sheet of spreadsheet.sheets) {
        const sheetTitle = sheet.properties.title;
        sheetNames.push(sheetTitle);

        // Get sheet data
        const valuesResponse = await this.sheets.spreadsheets.values.get({
          spreadsheetId: fileId,
          range: sheetTitle,
        });

        if (valuesResponse.data.values) {
          content += `\n## Sheet: ${sheetTitle}\n`;
          
          // Convert rows to text
          valuesResponse.data.values.forEach((row, rowIndex) => {
            if (row && row.length > 0) {
              const rowText = row.join(' | ');
              content += `Row ${rowIndex + 1}: ${rowText}\n`;
            }
          });
        }
      }

      return {
        content: content,
        metadata: {
          title: spreadsheet.properties.title,
          spreadsheet_id: spreadsheet.spreadsheetId,
          sheet_count: spreadsheet.sheets.length,
          sheet_names: sheetNames,
        },
      };
    } catch (error) {
      logger.error(`Failed to extract Google Sheets content for ${fileId}:`, error);
      throw error;
    }
  }

  /**
   * Extract content from Google Slides
   * @param {string} fileId - Google Slides file ID
   * @returns {Promise<Object>} - Extracted content and metadata
   */
  async extractGoogleSlidesContent(fileId) {
    try {
      const response = await this.slides.presentations.get({
        presentationId: fileId,
      });

      const presentation = response.data;
      let content = '';

      if (presentation.slides) {
        presentation.slides.forEach((slide, index) => {
          content += `\n## Slide ${index + 1}\n`;
          
          if (slide.pageElements) {
            slide.pageElements.forEach(element => {
              if (element.shape && element.shape.text) {
                const textContent = this.extractTextFromSlideTextElements(element.shape.text.textElements);
                if (textContent.trim()) {
                  content += textContent + '\n';
                }
              }
            });
          }
        });
      }

      return {
        content: content,
        metadata: {
          title: presentation.title,
          presentation_id: presentation.presentationId,
          slide_count: presentation.slides ? presentation.slides.length : 0,
        },
      };
    } catch (error) {
      logger.error(`Failed to extract Google Slides content for ${fileId}:`, error);
      throw error;
    }
  }

  /**
   * Extract content from binary files (PDF, DOCX, etc.)
   * @param {Object} file - File metadata
   * @returns {Promise<Object>} - Extracted content and metadata
   */
  async extractBinaryFileContent(file) {
    try {
      // Download file content
      const response = await this.drive.files.get({
        fileId: file.id,
        alt: 'media',
      });

      // For now, return basic metadata - in a full implementation,
      // you would use appropriate parsers (pdf-parse, mammoth, etc.)
      return {
        content: `[Binary file content from ${file.name} - content extraction not fully implemented]`,
        metadata: {
          binary_file: true,
          original_name: file.name,
          extraction_note: 'Binary file content extraction requires additional implementation',
        },
      };
    } catch (error) {
      logger.error(`Failed to extract binary file content for ${file.name}:`, error);
      throw error;
    }
  }

  /**
   * Extract text from Google Docs elements
   * @param {Array} elements - Document elements
   * @returns {string} - Extracted text
   */
  extractTextFromDocElements(elements) {
    let text = '';
    
    for (const element of elements) {
      if (element.paragraph) {
        for (const paragraphElement of element.paragraph.elements) {
          if (paragraphElement.textRun) {
            text += paragraphElement.textRun.content;
          }
        }
      } else if (element.table) {
        // Extract table content
        for (const row of element.table.tableRows) {
          for (const cell of row.tableCells) {
            const cellText = this.extractTextFromDocElements(cell.content);
            text += cellText + '\t';
          }
          text += '\n';
        }
      }
    }
    
    return text;
  }

  /**
   * Extract text from Google Slides text elements
   * @param {Array} textElements - Text elements
   * @returns {string} - Extracted text
   */
  extractTextFromSlideTextElements(textElements) {
    let text = '';
    
    if (textElements) {
      for (const element of textElements) {
        if (element.textRun) {
          text += element.textRun.content;
        }
      }
    }
    
    return text;
  }

  /**
   * Get content type from MIME type
   * @param {string} mimeType - MIME type
   * @returns {string} - Content type
   */
  getContentTypeFromMimeType(mimeType) {
    const mimeTypeMap = {
      'application/vnd.google-apps.document': 'google_doc',
      'application/vnd.google-apps.spreadsheet': 'google_sheet',
      'application/vnd.google-apps.presentation': 'google_slides',
      'application/pdf': 'pdf',
      'text/plain': 'text',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    };

    return mimeTypeMap[mimeType] || 'unknown';
  }

  /**
   * Load folder cache from file
   */
  async loadFolderCache() {
    try {
      if (await fs.pathExists(this.config.cacheFile)) {
        const cacheData = await fs.readJson(this.config.cacheFile);
        
        for (const [name, info] of Object.entries(cacheData)) {
          this.folderCache.set(name, info);
        }
        
        logger.debug(`Loaded folder cache with ${this.folderCache.size} entries`);
      }
    } catch (error) {
      logger.warn('Failed to load folder cache:', error.message);
      this.folderCache.clear();
    }
  }

  /**
   * Save folder cache to file
   */
  async saveFolderCache() {
    try {
      const cacheData = Object.fromEntries(this.folderCache);
      await fs.ensureDir(path.dirname(this.config.cacheFile));
      await fs.writeJson(this.config.cacheFile, cacheData, { spaces: 2 });
      
      logger.debug('Folder cache saved successfully');
    } catch (error) {
      logger.warn('Failed to save folder cache:', error.message);
    }
  }

  /**
   * Check if cache needs refresh
   * @returns {boolean} - True if cache needs refresh
   */
  needsCacheRefresh() {
    if (this.folderCache.size === 0) {
      return true;
    }

    const now = new Date();
    const refreshInterval = this.config.refreshIntervalHours * 60 * 60 * 1000;

    for (const [name, info] of this.folderCache.entries()) {
      const cachedAt = new Date(info.cachedAt);
      if (now - cachedAt > refreshInterval) {
        logger.info(`Cache for folder "${name}" is stale, needs refresh`);
        return true;
      }
    }

    return false;
  }

  /**
   * Get health check information
   * @returns {Promise<Object>} - Health check data
   */
  async getHealthCheck() {
    try {
      if (!this.config.enabled) {
        return {
          enabled: false,
          status: 'disabled',
          message: 'Google Drive integration is disabled',
        };
      }

      if (!this.isInitialized) {
        return {
          enabled: true,
          status: 'not_initialized',
          message: 'Google Drive service not initialized',
        };
      }

      // Test API access
      const testResponse = await this.drive.about.get({
        fields: 'user',
      });

      // Get folder info
      const folderId = await this.findTargetFolder();
      const files = await this.getFilesFromTargetFolder();

      return {
        enabled: true,
        status: 'healthy',
        message: 'Google Drive integration is working',
        details: {
          authenticated_user: testResponse.data.user?.emailAddress,
          target_folder_id: folderId,
          target_folder_name: this.config.targetFolderName || 'Using direct folder ID',
          files_found: files.length,
          supported_files: files.filter(f => this.config.supportedMimeTypes.includes(f.mimeType)).length,
          last_check: new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.error('Google Drive health check failed:', error);
      
      return {
        enabled: true,
        status: 'error',
        message: 'Google Drive integration has errors',
        error: error.message,
        last_check: new Date().toISOString(),
      };
    }
  }

  /**
   * Close the Google Drive service
   */
  async close() {
    if (this.folderCache.size > 0) {
      await this.saveFolderCache();
    }
    
    this.auth = null;
    this.drive = null;
    this.docs = null;
    this.sheets = null;
    this.slides = null;
    this.folderCache.clear();
    this.isInitialized = false;
    
    logger.info('Google Drive Service closed');
  }
}

module.exports = GoogleDriveService;
