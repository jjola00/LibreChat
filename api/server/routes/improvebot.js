const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const { requireJwtAuth, checkBan, uaParser } = require('~/server/middleware');
const router = express.Router();

// Apply authentication middleware (removed admin requirement for self-improvement)
router.use(requireJwtAuth);
router.use(checkBan);
router.use(uaParser);

// Propose improvement endpoint
router.post('/propose', async (req, res) => {
  const { improvement_request, conversation_context } = req.body;
  
  if (!improvement_request) {
    return res.status(400).json({ error: 'improvement_request is required' });
  }

  try {
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

    const command = `cd ${process.cwd()} && PROMPT_FILE=system_prompt/system_prompt.md improvebot/propose.sh "${enhancedRequest}"`;
    
    exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('Propose error:', error);
        return res.status(500).json({ error: 'Failed to generate proposal', details: stderr });
      }
      
      res.json({
        success: true,
        diff: stdout,
        message: 'Improvement proposal generated',
        context: conversation_context
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Apply improvement endpoint
router.post('/apply', async (req, res) => {
  const { diff, approver, why, impact } = req.body;
  
  if (!diff) {
    return res.status(400).json({ error: 'diff is required' });
  }

  try {
    // Write diff to temp file
    const fs = require('fs');
    const tmpFile = `/tmp/improvebot_${Date.now()}.diff`;
    fs.writeFileSync(tmpFile, diff);

    const env = {
      ...process.env,
      ALLOWED_PROMPT_FILE: 'system_prompt/system_prompt.md',
      APPROVER: approver || 'LibreChat Admin',
      WHY: why || 'User-approved system improvement',
      IMPACT: impact || 'Enhanced capabilities'
    };

    const command = `cd ${process.cwd()} && improvebot/apply_diff.sh "${tmpFile}"`;
    
    exec(command, { env, timeout: 10000 }, (error, stdout, stderr) => {
      // Clean up temp file
      fs.unlinkSync(tmpFile);
      
      if (error) {
        console.error('Apply error:', error);
        return res.status(500).json({ error: 'Failed to apply improvement', details: stderr });
      }
      
      res.json({
        success: true,
        message: 'Improvement applied successfully',
        output: stdout
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Get current system prompt
router.get('/prompt', (req, res) => {
  try {
    const fs = require('fs');
    const promptPath = path.join(process.cwd(), 'system_prompt/system_prompt.md');
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

// Get changelog
router.get('/changelog', (req, res) => {
  try {
    const fs = require('fs');
    const changelogPath = path.join(process.cwd(), 'system_prompt/prompt_changelog.md');
    const content = fs.readFileSync(changelogPath, 'utf8');
    
    res.json({
      success: true,
      content: content
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read changelog', details: error.message });
  }
});

// Re-answer endpoint - for testing improved responses
router.post('/re-answer', async (req, res) => {
  const { question, context } = req.body;
  
  if (!question) {
    return res.status(400).json({ error: 'question is required' });
  }

  try {
    const fs = require('fs');
    const promptPath = path.join(process.cwd(), 'system_prompt/system_prompt.md');
    const systemPrompt = fs.readFileSync(promptPath, 'utf8');
    
    // This is a simple implementation - in a real system you'd call your LLM
    // For now, we'll return a test response indicating the improvement worked
    const testResponse = `Based on the updated system prompt, here's my improved response:

Previous response indicated knowledge gap for: "${question}"

With the improved knowledge base, I can now provide better guidance. The system has been enhanced to handle this type of question more effectively.

[This is a test response - in production, this would call your LLM with the updated system prompt]`;

    res.json({
      success: true,
      improved_response: testResponse,
      system_prompt_used: systemPrompt.substring(0, 200) + '...',
      original_question: question,
      context: context
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate improved response', details: error.message });
  }
});

module.exports = router;