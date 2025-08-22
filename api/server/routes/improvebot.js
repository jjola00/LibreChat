const express = require('express');
const path = require('path');
const { execFile } = require('child_process');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

router.use(requireJwtAuth);

/**
 * POST /api/improvebot
 * Body: { request: string, apply?: boolean, mock?: boolean }
 */
router.post('/', async (req, res) => {
  try {
    const { request, apply = true, mock = false } = req.body || {};
    if (!request || typeof request !== 'string' || !request.trim()) {
      return res.status(400).json({ error: 'Missing request' });
    }

    const repoRoot = path.resolve(__dirname, '../../..');
    const scriptPath = path.join(repoRoot, 'improvebot', 'improve.sh');

    const args = [];
    if (apply) {
      args.push('-y');
    }
    args.push('--');
    args.push(request);

    const env = {
      ...process.env,
      // Allow overriding via env; default to main system prompt
      PROMPT_FILE: process.env.IMPROVEBOT_PROMPT_FILE || 'system_prompt/system_prompt.md',
      ALLOWED_PROMPT_FILE: process.env.IMPROVEBOT_PROMPT_FILE || 'system_prompt/system_prompt.md',
      GUARDRAILS_FILE: process.env.IMPROVEBOT_GUARDRAILS_FILE || 'improvebot/guardrails.md',
    };

    if (mock) {
      env.MOCK = '1';
    }

    // Use /usr/bin/env bash to avoid executable-bit dependency
    execFile('/usr/bin/env', ['bash', scriptPath, ...args], { cwd: repoRoot, env }, (err, stdout, stderr) => {
      if (err) {
        return res.status(500).json({ error: 'Improvebot failed', details: String(err), stderr });
      }
      return res.status(200).json({ ok: true, applied: !!apply, stdout, stderr });
    });
  } catch (e) {
    return res.status(500).json({ error: 'Unexpected error', details: String(e) });
  }
});

module.exports = router; 