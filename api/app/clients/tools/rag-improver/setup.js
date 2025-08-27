#!/usr/bin/env node

/**
 * Setup Script for Self-Improving RAG System
 * Initializes the system, creates necessary directories, and loads sample data
 */

const fs = require('fs-extra');
const path = require('path');
const { config } = require('./config');
const RAGEngine = require('./core/RAGEngine');
const { logger } = require('@librechat/data-schemas');

async function setup() {
  try {
    console.log('🚀 Setting up Self-Improving RAG System...\n');

    // Step 1: Create necessary directories
    console.log('📁 Creating directories...');
    await createDirectories();
    console.log('✅ Directories created\n');

    // Step 2: Initialize the RAG engine
    console.log('🤖 Initializing RAG engine...');
    const ragEngine = new RAGEngine(config);
    await ragEngine.initialize();
    console.log('✅ RAG engine initialized\n');

    // Step 3: Load data from Google Drive
    console.log('📚 Loading company data from Google Drive...');
    await loadGoogleDriveData(ragEngine);
    console.log('✅ Google Drive data loaded\n');

    // Step 4: Verify system
    console.log('🔍 Verifying system...');
    await verifySystem(ragEngine);
    console.log('✅ System verification complete\n');

    // Step 5: Create sample queries
    console.log('💬 Testing with sample queries...');
    await testSampleQueries(ragEngine);
    console.log('✅ Sample queries tested\n');

    console.log('🎉 Setup complete! The Self-Improving RAG System is ready to use.\n');
    
    console.log('📋 Next steps:');
    console.log('1. Your Google Drive content is now loaded and ready to use');
    console.log('2. Add more documents to the "Test Context" folder as needed');
    console.log('3. Configure employee directory (optional)');
    console.log('4. Set up Slack/email notifications (optional)');
    console.log('5. Start using the system in LibreChat\n');

    await ragEngine.close();
    
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
}

/**
 * Create necessary directories
 */
async function createDirectories() {
  const directories = [
    config.logging.logDirectory,
    config.knowledgeUpdate.backupDirectory,
    config.vectorDB.persistDirectory,
    path.join(config.logging.logDirectory, 'workflows'),
    path.join(config.logging.logDirectory, 'processed_info'),
    path.join(__dirname, 'data'),
    path.join(__dirname, 'data', 'sample_docs'),
  ];

  for (const dir of directories) {
    await fs.ensureDir(dir);
    console.log(`  ✓ ${dir}`);
  }
}

/**
 * Load data from Google Drive "Test Context" folder
 */
async function loadGoogleDriveData(ragEngine) {
  try {
    console.log('  📂 Connecting to Google Drive...');
    
    // Check if Google Drive is enabled
    if (!config.googleDrive.enabled) {
      console.log('  ⚠️  Google Drive integration is disabled. Enable it in config to load real data.');
      return { documentsProcessed: 0 };
    }

    // Validate credentials file exists
    const fs = require('fs-extra');
    if (!await fs.pathExists(config.googleDrive.credentialsPath)) {
      throw new Error(`Google Drive credentials file not found: ${config.googleDrive.credentialsPath}`);
    }

    const folderInfo = config.googleDrive.targetFolderId 
      ? `folder ID: "${config.googleDrive.targetFolderId}"`
      : `folder: "${config.googleDrive.targetFolderName}"`;
    console.log(`  🔍 Searching for ${folderInfo}`);
    
    // Ingest documents from Google Drive
    const result = await ragEngine.ingestDocuments('google_drive');
    
    if (result.documentsProcessed === 0) {
      console.log('  ⚠️  No documents found in Google Drive folder. Please ensure:');
      console.log('     1. The target folder exists and is shared with the service account');
      console.log('     2. The folder contains supported file types (Docs, Sheets, Slides, PDFs, etc.)');
      console.log('     3. The service account has read access to the folder');
      console.log('     4. The required Google APIs are enabled (Drive, Docs, Sheets, Slides)');
    } else {
      console.log(`  ✅ Successfully loaded ${result.documentsProcessed} documents from Google Drive`);
    }
    
    return result;
  } catch (error) {
    console.error('  ❌ Failed to load Google Drive data:', error.message);
    
    // Provide helpful error messages
    if (error.message.includes('credentials')) {
      console.log('  💡 Make sure the Google Drive service account credentials are properly configured.');
    } else if (error.message.includes('not found') || error.message.includes('not accessible')) {
      console.log('  💡 Make sure the "Test Context" folder is shared with the service account email.');
    } else if (error.message.includes('authentication') || error.message.includes('authorization')) {
      console.log('  💡 Check that the service account has the correct permissions and scopes.');
    }
    
    throw error;
  }
}

/**
 * Verify system functionality
 */
async function verifySystem(ragEngine) {
  try {
    // Test vector database
    const stats = await ragEngine.getStatistics();
    console.log(`  ✓ Vector database: ${stats.vectorDatabase.totalDocuments} documents`);

    // Show Google Drive integration status
    if (stats.googleDrive) {
      if (stats.googleDrive.status === 'healthy') {
        console.log(`  ✓ Google Drive: ${stats.googleDrive.details.files_found} files found in "${stats.googleDrive.details.target_folder_name}"`);
        console.log(`  ✓ Supported files: ${stats.googleDrive.details.supported_files}`);
      } else {
        console.log(`  ⚠️  Google Drive status: ${stats.googleDrive.status} - ${stats.googleDrive.message}`);
      }
    }

    // Test knowledge gap detection with a question that definitely won't be in business docs
    const gapResult = await ragEngine.query('How do I travel to Mars?', { includeGapDetection: true });
    if (gapResult.knowledgeGap && gapResult.knowledgeGap.hasGap) {
      console.log('  ✓ Knowledge gap detection working');
    }

    // Test regular query with a generic business question
    const queryResult = await ragEngine.query('What is this document about?');
    if (queryResult.confidence > 0.3) {
      console.log('  ✓ Query processing working');
    }

  } catch (error) {
    console.error('  ❌ System verification failed:', error);
    throw error;
  }
}

/**
 * Test sample queries
 */
async function testSampleQueries(ragEngine) {
  // Generic queries that should work with any business content
  const sampleQueries = [
    'What information is available?',
    'Can you tell me about the content?',
    'What topics are covered?',
    'What should I know?',
  ];

  console.log('  Testing with generic business queries...');

  for (const query of sampleQueries) {
    try {
      const result = await ragEngine.query(query);
      console.log(`  ✓ "${query}" - Confidence: ${Math.round(result.confidence * 100)}%`);
      
      // Show source information for the first query to demonstrate Drive integration
      if (query === sampleQueries[0] && result.sources && result.sources.length > 0) {
        console.log(`    📄 Found content from: ${result.sources[0].filename}`);
      }
    } catch (error) {
      console.log(`  ❌ "${query}" - Failed: ${error.message}`);
    }
  }
}

// Run setup if this file is executed directly
if (require.main === module) {
  setup().catch(console.error);
}

module.exports = { setup };
