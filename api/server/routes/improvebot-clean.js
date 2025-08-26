const express = require('express');
const { execFile } = require('child_process');
const path = require('path');
const passport = require('passport');
const { logger } = require('~/config');

const router = express.Router();

// Resolve the repository root
const REPO_ROOT = path.resolve(__dirname, '../../..');

// Custom JWT auth middleware with proper error handling
const authenticateUser = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    if (err) {
      logger.error('[Improvebot] JWT authentication error:', err);
      return res.status(500).json({ 
        error: 'Authentication error', 
        details: 'Internal authentication failure' 
      });
    }
    if (!user) {
      logger.warn('[Improvebot] JWT authentication failed:', info);
      return res.status(401).json({ 
        error: 'Authentication required', 
        details: 'Please log in to use Improvebot',
        hint: 'Your session may have expired. Try refreshing the page and logging in again.'
      });
    }
    req.user = user;
    next();
  })(req, res, next);
};

// Test endpoint (no auth required)
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Improvebot route is working!', 
    timestamp: new Date().toISOString(),
    route: 'clean-improvebot'
  });
});

// Get current system prompt (no auth required)
router.get('/prompt', (req, res) => {
  try {
    const fs = require('fs');
    const promptPath = path.join(REPO_ROOT, 'system_prompt/system_prompt.md');
    const content = fs.readFileSync(promptPath, 'utf8');
    
    res.json({
      success: true,
      content: content,
      path: 'system_prompt/system_prompt.md'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read prompt file', details: error.message });
  }
});

// Propose improvement endpoint (auth required)
router.post('/propose', authenticateUser, async (req, res) => {
  const { improvement_request, conversation_context } = req.body;
  
  logger.info('[Improvebot] /propose called by user:', req.user?.id || 'unknown');
  
  if (!improvement_request) {
    return res.status(400).json({ error: 'improvement_request is required' });
  }

  try {
    // Debug API key presence
    const hasApiKey = !!process.env.OPENAI_API_KEY;
    const apiKeyLength = process.env.OPENAI_API_KEY?.length || 0;
    logger.info('[Improvebot] OPENAI_API_KEY check:', { 
      hasApiKey, 
      keyLength: apiKeyLength,
      keyPrefix: process.env.OPENAI_API_KEY?.substring(0, 8) || 'none'
    });
    
    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({ 
        error: 'OPENAI_API_KEY not configured on server',
        hint: 'Ask your admin to set OPENAI_API_KEY in the server environment'
      });
    }

    let enhancedRequest = improvement_request;
    
    // If conversation context is provided, enhance the request
    if (conversation_context) {
      const { user_question, assistant_response } = conversation_context;
      if (user_question && assistant_response) {
        enhancedRequest = `Context - Previous conversation:
User asked: "${user_question}"
Assistant responded: "${assistant_response}"

Improvement request: ${improvement_request}

Please update the system prompt to handle this type of question better in the future.`;
      }
    }

    const scriptPath = path.join(REPO_ROOT, 'improvebot', 'propose.sh');
    const childEnv = {
      ...process.env,
      PROMPT_FILE: 'system_prompt/system_prompt.md',
      GUARDRAILS_FILE: 'improvebot/guardrails.md',
    };

    execFile(
      scriptPath,
      [enhancedRequest],
      { cwd: REPO_ROOT, env: childEnv, timeout: 90000, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          logger.error('[Improvebot] Propose error:', error, stderr);
          const details = (stderr || error.message || '').toString();
          const hint = details.includes('ERROR: Set OPENAI_API_KEY')
            ? 'Server missing OPENAI_API_KEY. Set it in docker-compose.override.yml and restart.'
            : undefined;
          return res.status(500).json({ error: 'Failed to generate proposal', details, hint });
        }

        res.json({
          success: true,
          diff: stdout,
          message: 'Improvement proposal generated',
          context: conversation_context
        });
      }
    );
  } catch (error) {
    logger.error('[Improvebot] Exception:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

module.exports = router;
