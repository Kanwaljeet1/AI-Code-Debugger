import { Router } from 'express';
import { analyzeAgentRequest, analyzeDebugRequest, fallbackResponse } from '../services/debugAssistant.js';

const router = Router();

// Note: left open for rapid prototyping. Add authRequired if you need to lock it down.
router.post('/debug', async (req, res) => {
  const { logs = 'No logs provided', snippet = 'No code provided' } = req.body || {};
  try {
    const result = await analyzeDebugRequest({ logs, snippet });
    res.json({ result });
  } catch (err) {
    console.error('debug endpoint failed', err);
    const result = {
      ...fallbackResponse([], `${logs}\n${snippet}`),
      source: 'error-handler',
      error: err.message,
      similar: []
    };
    res.status(200).json({ result, warning: 'LLM failed; served fallback' });
  }
});

// Cursor-style agent prompt: combines user prompt + logs + snippet + recall + (optional) OpenAI.
router.post('/agent', async (req, res) => {
  const { prompt = '', logs = 'No logs provided', snippet = 'No code provided' } = req.body || {};
  try {
    const result = await analyzeAgentRequest({ prompt, logs, snippet });
    res.json({ result });
  } catch (err) {
    console.error('agent endpoint failed', err);
    const result = {
      ...fallbackResponse([], `${prompt}\n${logs}\n${snippet}`),
      source: 'agent-error-handler',
      assistant_message: 'Agent failed unexpectedly. Returning fallback analysis.',
      steps: ['Catch error', 'Return fallback'],
      error: err.message,
      similar: []
    };
    res.status(200).json({ result, warning: 'Agent failed; served fallback' });
  }
});

export default router;
