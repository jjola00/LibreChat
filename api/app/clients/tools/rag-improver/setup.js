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

    // Step 3: Load sample data
    console.log('📚 Loading sample company data...');
    await loadSampleData(ragEngine);
    console.log('✅ Sample data loaded\n');

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
    console.log('1. Add your company documents to the knowledge base');
    console.log('2. Configure employee directory (optional)');
    console.log('3. Set up Slack/email notifications (optional)');
    console.log('4. Start using the system in LibreChat\n');

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
 * Load sample company data
 */
async function loadSampleData(ragEngine) {
  const sampleDocs = [
    {
      id: 'sample-1',
      content: `# Annual Leave Policy

## Overview
Dogpatch Labs provides generous annual leave for all employees to maintain work-life balance.

## Entitlements
- New employees: 20 days annual leave
- After 2 years: 25 days annual leave
- After 5 years: 30 days annual leave

## How to Request Leave
1. Submit request through Personio platform
2. Get manager approval
3. Update team calendar
4. Notify HR team

## Contact
For questions about annual leave, contact:
- HR Team: hr@dogpatchlabs.com
- Personio platform: https://dogpatch.personio.com`,
      source: 'sample_policy',
      filename: 'annual_leave_policy.md',
      content_type: 'policy',
      metadata: {
        title: 'Annual Leave Policy',
        category: 'HR',
        keywords: ['leave', 'vacation', 'holiday', 'time off', 'Personio'],
        confidence_score: 1.0,
      },
    },
    {
      id: 'sample-2',
      content: `# IT Support Guide

## Getting Help
For technical issues, contact our IT support team:

## Contact Methods
- Email: it@dogpatchlabs.com
- Slack: #it-support
- Phone: +353 1 555 0123 (emergency only)

## Common Issues

### WiFi Access
- Guest WiFi: DogpatchGuest (password: Welcome2023)
- Staff WiFi: DogpatchStaff (contact IT for password)

### Password Reset
1. Go to https://accounts.dogpatchlabs.com
2. Click "Forgot Password"
3. Follow email instructions

### Software Installation
All software requests must be approved by IT team. Submit requests via Slack #it-support.

## Office Hours
IT support is available:
- Monday-Friday: 9:00 AM - 6:00 PM
- Emergency support available 24/7`,
      source: 'sample_guide',
      filename: 'it_support_guide.md',
      content_type: 'guide',
      metadata: {
        title: 'IT Support Guide',
        category: 'IT',
        keywords: ['IT', 'support', 'wifi', 'password', 'technical', 'computer'],
        confidence_score: 1.0,
      },
    },
    {
      id: 'sample-3',
      content: `# Office Facilities & Meeting Rooms

## Meeting Room Booking
Use the office booking system to reserve meeting rooms:

### Available Rooms
1. **Conference Room A** - Seats 12, has projector
2. **Conference Room B** - Seats 8, has TV screen
3. **Phone Booth 1** - 1-2 people, quiet calls
4. **Phone Booth 2** - 1-2 people, quiet calls
5. **Collaboration Space** - Open area, 6 people

### How to Book
1. Check availability on office calendar
2. Book through Google Calendar
3. Add room as attendee: room-a@dogpatchlabs.com
4. Include meeting details in description

### Kitchen Facilities
- Coffee machine (free)
- Refrigerator and microwave
- Dishes and utensils provided
- Please clean up after use

### Office Supplies
Located in storage room near kitchen. Contact admin@dogpatchlabs.com for restocking.

## Building Access
- Office hours: 7:00 AM - 10:00 PM
- Weekend access: Contact security
- Lost key card: Contact admin immediately`,
      source: 'sample_facilities',
      filename: 'office_facilities.md',
      content_type: 'guide',
      metadata: {
        title: 'Office Facilities & Meeting Rooms',
        category: 'Admin',
        keywords: ['meeting room', 'booking', 'office', 'facilities', 'kitchen'],
        confidence_score: 1.0,
      },
    },
    {
      id: 'sample-4',
      content: `# Emergency Contacts & Procedures

## Emergency Numbers
- Fire Emergency: 999
- Gardaí (Police): 999
- Medical Emergency: 999
- Building Security: +353 1 555 0199

## Office Emergency Contacts
- Office Manager: Sarah Johnson - sarah@dogpatchlabs.com - +353 86 123 4567
- HR Manager: Michael Chen - michael@dogpatchlabs.com - +353 86 234 5678
- IT Manager: Emma Walsh - emma@dogpatchlabs.com - +353 86 345 6789

## Fire Safety
1. **Fire Alarm**: Evacuate immediately via nearest exit
2. **Assembly Point**: Front courtyard of building
3. **Fire Wardens**: Sarah (Floor 1), Michael (Floor 2)

## First Aid
- First Aid Kit: Kitchen area, near coffee machine
- Trained First Aiders: Sarah Johnson, Emma Walsh
- Automated Defibrillator: Ground floor reception

## Building Issues
For building maintenance issues:
- Contact building management: +353 1 555 0100
- Emergency repairs: facilities@building.com
- Report via office manager if urgent

## Incident Reporting
All incidents must be reported within 24 hours:
1. Notify office manager immediately
2. Complete incident report form
3. Send to hr@dogpatchlabs.com`,
      source: 'sample_emergency',
      filename: 'emergency_procedures.md',
      content_type: 'procedure',
      metadata: {
        title: 'Emergency Contacts & Procedures',
        category: 'Admin',
        keywords: ['emergency', 'contact', 'fire', 'safety', 'first aid'],
        confidence_score: 1.0,
      },
    },
  ];

  const result = await ragEngine.ingestDocuments(sampleDocs);
  console.log(`  ✓ Loaded ${result.documentsProcessed} sample documents`);
}

/**
 * Verify system functionality
 */
async function verifySystem(ragEngine) {
  try {
    // Test vector database
    const stats = await ragEngine.getStatistics();
    console.log(`  ✓ Vector database: ${stats.vectorDatabase.totalDocuments} documents`);

    // Test knowledge gap detection
    const gapResult = await ragEngine.query('How do I travel to Mars?', { includeGapDetection: true });
    if (gapResult.knowledgeGap.hasGap) {
      console.log('  ✓ Knowledge gap detection working');
    }

    // Test regular query
    const queryResult = await ragEngine.query('How do I request annual leave?');
    if (queryResult.confidence > 0.7) {
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
  const sampleQueries = [
    'How do I request annual leave?',
    'What is the WiFi password for guests?',
    'How do I book a meeting room?',
    'Who should I contact for IT support?',
  ];

  for (const query of sampleQueries) {
    try {
      const result = await ragEngine.query(query);
      console.log(`  ✓ "${query}" - Confidence: ${Math.round(result.confidence * 100)}%`);
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
