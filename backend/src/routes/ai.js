import { Router } from 'express';
import { analyzeDebugRequest, fallbackResponse } from '../services/debugAssistant.js';

const router = Router();

// Note: left open for rapid prototyping. Add authRequired if you need to lock it down.
router.post('/debug', async (req, res) => {
  const { logs = 'No logs provided', snippet = 'No code provided' } = req.body || {};
  try {
    const result = await analyzeDebugRequest({ logs, snippet });
    res.json({ result });
  } catch (err) {
    console.error('debug endpoint failed', err);
    const result = { ...fallbackResponse([]), source: 'error-handler', error: err.message, similar: [] };
    res.status(200).json({ result, warning: 'LLM failed; served fallback' });
  }
});

export default router;
