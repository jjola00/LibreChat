#!/usr/bin/env node

/**
 * Test Suite for Self-Improving RAG System
 * Validates core functionality and integration
 */

const { config } = require('./config');
const RAGEngine = require('./core/RAGEngine');
const VectorDatabase = require('./core/VectorDatabase');
const DocumentProcessor = require('./core/DocumentProcessor');
const KnowledgeGapDetector = require('./core/KnowledgeGapDetector');
const AgentWorkflowManager = require('./agents/AgentWorkflowManager');
const LoggingSystem = require('./core/LoggingSystem');
const DogpatchKnowledgeBase = require('../structured/DogpatchKnowledgeBase');

class TestSuite {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  /**
   * Add a test case
   */
  test(name, testFn) {
    this.tests.push({ name, testFn });
  }

  /**
   * Run all tests
   */
  async run() {
    console.log('🧪 Starting Self-Improving RAG System Test Suite\n');

    for (const test of this.tests) {
      try {
        console.log(`🔍 Testing: ${test.name}`);
        await test.testFn();
        console.log(`✅ PASS: ${test.name}\n`);
        this.passed++;
      } catch (error) {
        console.log(`❌ FAIL: ${test.name}`);
        console.log(`   Error: ${error.message}\n`);
        this.failed++;
      }
    }

    console.log(`📊 Test Results:`);
    console.log(`   Passed: ${this.passed}`);
    console.log(`   Failed: ${this.failed}`);
    console.log(`   Total:  ${this.tests.length}`);

    if (this.failed === 0) {
      console.log('\n🎉 All tests passed!');
      return true;
    } else {
      console.log('\n⚠️  Some tests failed.');
      return false;
    }
  }

  /**
   * Assert helper
   */
  assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  /**
   * Assert equals helper
   */
  assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
  }

  /**
   * Assert contains helper
   */
  assertContains(haystack, needle, message) {
    if (!haystack.includes(needle)) {
      throw new Error(message || `Expected "${haystack}" to contain "${needle}"`);
    }
  }
}

// Create test suite
const testSuite = new TestSuite();

// Test 1: Configuration Validation
testSuite.test('Configuration Validation', async () => {
  const { validateConfig } = require('./config');
  
  // Should not throw for valid config
  validateConfig();
  
  testSuite.assert(config.openai.apiKey, 'OpenAI API key should be configured');
  testSuite.assert(config.vectorDB.chromaUrl, 'Chroma URL should be configured');
});

// Test 2: Vector Database Initialization
testSuite.test('Vector Database Initialization', async () => {
  const vectorDB = new VectorDatabase(config);
  await vectorDB.initialize();
  
  const stats = await vectorDB.getStatistics();
  testSuite.assert(stats.collectionName === config.vectorDB.collection, 'Collection name should match config');
  
  await vectorDB.close();
});

// Test 3: Document Processing
testSuite.test('Document Processing', async () => {
  const processor = new DocumentProcessor(config);
  
  // Test text cleaning
  const dirty = "  Hello\r\n\n\n  World  \t  ";
  const clean = processor.cleanText(dirty);
  testSuite.assertEqual(clean, "Hello\n\n World", 'Text cleaning should work');
  
  // Test JSON to text conversion
  const json = { name: "Test", value: 123, items: ["a", "b"] };
  const text = processor.jsonToText(json);
  testSuite.assertContains(text, "name: Test", 'JSON conversion should include name');
  testSuite.assertContains(text, "value: 123", 'JSON conversion should include value');
});

// Test 4: Knowledge Gap Detection
testSuite.test('Knowledge Gap Detection', async () => {
  const detector = new KnowledgeGapDetector(config);
  await detector.initialize();
  
  // Test quick gap check with no documents
  const quickGap = detector.performQuickGapCheck('test query', []);
  testSuite.assert(quickGap.hasGap, 'Should detect gap when no documents found');
  testSuite.assertEqual(quickGap.gapType, 'no_documents', 'Gap type should be no_documents');
  
  // Test date sensitive query detection
  const isDateSensitive = detector.isDateSensitiveQuery('What is the current policy?');
  testSuite.assert(isDateSensitive, 'Should detect date-sensitive queries');
  
  await detector.close();
});

// Test 5: Logging System
testSuite.test('Logging System', async () => {
  const logging = new LoggingSystem(config);
  await logging.initialize();
  
  // Test query logging
  await logging.logQuery({
    query: 'test query',
    response: 'test response',
    confidence: 0.8,
    metadata: { processingTime: 100 },
  });
  
  testSuite.assert(logging.queryLogs.length > 0, 'Query should be logged');
  
  // Test performance logging
  await logging.logPerformance({
    operation: 'test_operation',
    duration: 150,
    success: true,
  });
  
  testSuite.assert(logging.performanceMetrics.length > 0, 'Performance should be logged');
  
  await logging.close();
});

// Test 6: RAG Engine Integration
testSuite.test('RAG Engine Integration', async () => {
  const ragEngine = new RAGEngine(config);
  await ragEngine.initialize();
  
  // Test document ingestion
  const testDoc = [{
    id: 'test-doc-1',
    content: 'This is a test document about company policies.',
    source: 'test',
    filename: 'test.txt',
    content_type: 'text',
    metadata: {
      title: 'Test Document',
      category: 'test',
    },
  }];
  
  const ingestResult = await ragEngine.ingestDocuments(testDoc);
  testSuite.assert(ingestResult.success, 'Document ingestion should succeed');
  testSuite.assertEqual(ingestResult.documentsProcessed, 1, 'Should process one document');
  
  // Test querying
  const queryResult = await ragEngine.query('company policies');
  testSuite.assert(queryResult.response, 'Should return a response');
  testSuite.assert(queryResult.confidence >= 0, 'Should have confidence score');
  testSuite.assert(queryResult.sources.length >= 0, 'Should have sources array');
  
  await ragEngine.close();
});

// Test 7: LibreChat Tool Integration
testSuite.test('LibreChat Tool Integration', async () => {
  const tool = new DogpatchKnowledgeBase();
  
  // Test tool properties
  testSuite.assertEqual(tool.name, 'dogpatch_knowledge_base', 'Tool should have correct name');
  testSuite.assert(tool.description.length > 0, 'Tool should have description');
  
  // Test schema
  const schema = DogpatchKnowledgeBase.getSchema();
  testSuite.assert(schema.name, 'Schema should have name');
  testSuite.assert(schema.parameters, 'Schema should have parameters');
  
  // Test availability check
  const isAvailable = DogpatchKnowledgeBase.isAvailable();
  testSuite.assert(isAvailable, 'Tool should be available');
});

// Test 8: Agent Workflow Manager
testSuite.test('Agent Workflow Manager', async () => {
  const workflowManager = new AgentWorkflowManager(config);
  await workflowManager.initialize();
  
  // Test workflow strategy determination
  const gapAnalysis = {
    gapType: 'no_documents',
    expertContactNeeded: true,
    confidence: 0.9,
  };
  
  const strategy = workflowManager.determineWorkflowStrategy(gapAnalysis);
  testSuite.assert(strategy.type, 'Strategy should have type');
  testSuite.assert(strategy.priority, 'Strategy should have priority');
  
  // Test clarification suggestions
  const suggestions = workflowManager.generateClarificationSuggestions('test query');
  testSuite.assert(Array.isArray(suggestions), 'Should return array of suggestions');
  testSuite.assert(suggestions.length > 0, 'Should have at least one suggestion');
  
  await workflowManager.close();
});

// Test 9: Google Drive Integration
testSuite.test('Google Drive Integration', async () => {
  if (!config.googleDrive.enabled) {
    console.log('  Skipping Google Drive test - integration disabled');
    return;
  }

  const ragEngine = new RAGEngine(config);
  await ragEngine.initialize();
  
  // Test Google Drive health check
  const stats = await ragEngine.getStatistics();
  testSuite.assert(stats.googleDrive, 'Should include Google Drive status');
  
  if (stats.googleDrive.status === 'healthy') {
    const expectedFolderName = config.googleDrive.targetFolderName || 'Using direct folder ID';
    testSuite.assert(stats.googleDrive.details.target_folder_name === expectedFolderName, 'Should have correct folder reference');
    
    // Test Google Drive document ingestion
    const result = await ragEngine.ingestDocuments('google_drive');
    testSuite.assert(result.success, 'Google Drive ingestion should succeed');
    
    if (result.documentsProcessed > 0) {
      // Test query with Google Drive content
      const queryResult = await ragEngine.query('What information is available?');
      testSuite.assert(queryResult.response, 'Should return a response');
      testSuite.assert(queryResult.sources, 'Should have sources array');
      
      // Check if sources include Google Drive content
      if (queryResult.sources.length > 0) {
        const hasGoogleDriveSource = queryResult.sources.some(source => 
          source.metadata && source.metadata.source_type === 'google_drive'
        );
        testSuite.assert(hasGoogleDriveSource, 'Should include Google Drive sources');
      }
    }
  } else {
    console.log(`  Google Drive status: ${stats.googleDrive.status} - ${stats.googleDrive.message}`);
  }
  
  await ragEngine.close();
});

// Test 10: Error Handling
testSuite.test('Error Handling', async () => {
  // Test invalid configuration
  const invalidConfig = { ...config };
  delete invalidConfig.openai.apiKey;
  
  try {
    const ragEngine = new RAGEngine(invalidConfig);
    await ragEngine.initialize();
    testSuite.assert(false, 'Should throw error for invalid config');
  } catch (error) {
    testSuite.assert(error.message, 'Should throw descriptive error');
  }
  
  // Test graceful degradation
  const ragEngine = new RAGEngine(config);
  await ragEngine.initialize();
  
  // Query with empty string should not crash
  const emptyQuery = await ragEngine.query('');
  testSuite.assert(emptyQuery.response, 'Should handle empty query gracefully');
  
  await ragEngine.close();
});

// Run the test suite
async function runTests() {
  try {
    const success = await testSuite.run();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('Test suite failed to run:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { TestSuite, runTests };
