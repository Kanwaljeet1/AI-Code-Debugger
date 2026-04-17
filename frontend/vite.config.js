import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      // basic safety cap
      if (raw.length > 1_500_000) reject(new Error('Request too large'));
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(`${JSON.stringify(data)}\n`);
}

function safeParseJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(raw.slice(first, last + 1));
      } catch {
        // fall through
      }
    }
    const err = new Error(`Model did not return valid JSON. First 200 chars: ${raw.slice(0, 200)}`);
    err.code = 'BAD_JSON';
    throw err;
  }
}

function normalizeText(text = '') {
  return String(text).toLowerCase().replace(/\s+/g, ' ').trim();
}

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function evidenceMatchesInput(input, quote) {
  const q = String(quote || '').trim();
  if (!q) return false;
  // Use a whitespace/case-normalized match so minor formatting differences still count.
  return normalizeText(input).includes(normalizeText(q));
}

function computeGroundedness({ input, evidence }) {
  const ev = Array.isArray(evidence) ? evidence : [];
  if (ev.length === 0) return { groundedness: 0, matched: 0, total: 0 };
  const matched = ev.reduce((acc, q) => (evidenceMatchesInput(input, q) ? acc + 1 : acc), 0);
  return { groundedness: matched / ev.length, matched, total: ev.length };
}

function scoreIssue(issue, text) {
  const hay = normalizeText(text);
  let score = 0;
  if (issue.signature && hay.includes(normalizeText(issue.signature))) score += 5;
  if (issue.logHint && hay.includes(normalizeText(issue.logHint))) score += 3;
  if (issue.title && hay.includes(normalizeText(issue.title))) score += 2;
  for (const kw of issue.keywords || []) {
    const n = normalizeText(kw);
    if (n && hay.includes(n)) score += n.includes(' ') ? 1.5 : 1;
  }
  return score;
}

async function callOpenAIChat({ apiKey, model, messages }) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 900
    })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = data?.error?.message || data?.message || `OpenAI error (${resp.status})`;
    const err = new Error(msg);
    err.status = resp.status;
    err.payload = data;
    throw err;
  }
  const content = data?.choices?.[0]?.message?.content || '{}';
  return safeParseJsonObject(content);
}

export default defineConfig(({ mode }) => {
  // Ensure `VITE_API_URL` from `frontend/.env` is available to the dev proxy.
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_API_URL || 'http://localhost:4000';
  const openaiKey = env.OPENAI_API_KEY || '';
  const openaiModel = env.OPENAI_MODEL || 'gpt-4o-mini';
  // Import on-demand so this file still works if the frontend build is used elsewhere.
  // These are pure-data + pure-functions modules (no browser-only APIs).
  const pastIssues = () => import('./src/data/pastIssues.js');
  const debugUtils = () => import('./src/utils/debugAnalysis.js');

  return {
    plugins: [
      react(),
      {
        name: 'ai-debugging-assistant-genai',
        configureServer(server) {
          // Local GenAI endpoints inside the Vite dev server.
          // This avoids needing a separate backend port (which may be blocked by the environment).
          server.middlewares.use('/ai/debug', async (req, res, next) => {
            if (req.method !== 'POST') return next();
            try {
              const body = await readJson(req);
              const logs = body?.logs || 'No logs provided';
              const snippet = body?.snippet || 'No code provided';

              const { buildLocalAnalysis, buildFixedCodePreview } = await debugUtils();
              const local = buildLocalAnalysis({ logs, snippet });
              const baseFixed = local.fixed_code || buildFixedCodePreview({ logs, snippet, analysis: local });

              if (!openaiKey) {
                return sendJson(res, 200, {
                  result: { ...local, fixed_code: baseFixed, source: local.source || 'local' },
                  warning: 'OPENAI_API_KEY not set; served local analysis (Vite middleware)'
                });
              }

              const issues = (await pastIssues()).default || [];
              const text = `${logs}\n${snippet}`;
              const similar = issues
                .map((i) => ({ issue: i, score: scoreIssue(i, text) }))
                .filter((x) => x.score >= 1.25)
                .sort((a, b) => b.score - a.score)
                .slice(0, 3)
                .map((x) => x.issue);

              const prompt = [
                'You are an AI debugging assistant. Given raw logs and an optional code snippet, produce a concise, actionable diagnosis.',
                'Return JSON with keys: root_cause (1-2 sentences), fix (1-3 bullet sentences), confidence (0-1 float), pr_snippet (short PR-ready summary), code_snippet (optional patch hint), fixed_code (full revised snippet when code is provided), evidence (array of 2-6 verbatim quotes pulled from the provided logs/code).',
                'Rules: evidence quotes must appear verbatim in the provided logs/code; no made-up file paths/services.',
                '',
                'Similar past issues:',
                similar
                  .map((i) => `- ${i.id}: ${i.title}\n  signature: ${i.signature}\n  summary: ${i.summary}\n  recommended_fix: ${i.recommendedFix}`)
                  .join('\n') || '- none',
                '',
                'Logs:',
                logs,
                '',
                'Code:',
                snippet
              ].join('\n');

              const parsed = await callOpenAIChat({
                apiKey: openaiKey,
                model: openaiModel,
                messages: [
                  { role: 'system', content: 'You are a senior debugging assistant. Be concise and practical.' },
                  { role: 'user', content: prompt }
                ]
              });

              const inputText = `${logs}\n${snippet}`;
              const evidence = Array.isArray(parsed?.evidence) ? parsed.evidence : [];
              const g = computeGroundedness({ input: inputText, evidence });

              const merged = {
                ...local,
                ...parsed,
                source: 'openai-vite',
                similar: similar.length ? similar : local.similar || [],
                evidence,
                groundedness: Number(clamp01(g.groundedness).toFixed(2)),
                groundedness_meta: { matched: g.matched, total: g.total }
              };
              if (merged.groundedness < 0.5) {
                merged.warning = `Low groundedness (${merged.groundedness}). Treat this as a hypothesis; add the exact failing line or full stack trace.`;
                merged.confidence = Number(Math.min(Number(merged.confidence || 0), 0.45).toFixed(2));
              }
              const fixed = merged.fixed_code || buildFixedCodePreview({ logs, snippet, analysis: merged });
              return sendJson(res, 200, { result: { ...merged, fixed_code: fixed } });
            } catch (err) {
              const detail = String(err?.message || err);
              return sendJson(res, 200, {
                result: {
                  source: 'vite-error',
                  root_cause: 'Vite GenAI middleware failed.',
                  fix: detail,
                  confidence: 0.2,
                  pr_snippet: '',
                  code_snippet: '',
                  fixed_code: '',
                  error_detail: detail
                },
                warning: detail
              });
            }
          });

          server.middlewares.use('/ai/agent', async (req, res, next) => {
            if (req.method !== 'POST') return next();
            try {
              const body = await readJson(req);
              const userPrompt = body?.prompt || '';
              const logs = body?.logs || 'No logs provided';
              const snippet = body?.snippet || 'No code provided';

              const { buildLocalAnalysis, buildFixedCodePreview } = await debugUtils();
              const local = buildLocalAnalysis({ logs, snippet });

              if (!openaiKey) {
                const fixed = local.fixed_code || buildFixedCodePreview({ logs, snippet, analysis: local });
                return sendJson(res, 200, {
                  result: {
                    ...local,
                    source: local.source || 'local',
                    assistant_message: 'OPENAI_API_KEY not set; served local analysis (Vite middleware).',
                    steps: ['Run local recall', 'Return fixed-code preview'],
                    fixed_code: fixed
                  },
                  warning: 'OPENAI_API_KEY not set; served local analysis (Vite middleware)'
                });
              }

              const issues = (await pastIssues()).default || [];
              const text = `${userPrompt}\n${logs}\n${snippet}`;
              const similar = issues
                .map((i) => ({ issue: i, score: scoreIssue(i, text) }))
                .filter((x) => x.score >= 1.25)
                .sort((a, b) => b.score - a.score)
                .slice(0, 3)
                .map((x) => x.issue);

              const agentPrompt = [
                'You are an agentic debugging assistant (Cursor-style).',
                'Return JSON with keys: assistant_message, steps (array), root_cause, fix, confidence, pr_snippet, code_snippet, fixed_code, evidence (array of 2-6 verbatim quotes pulled from the provided logs/code).',
                'Rules: evidence quotes must appear verbatim in the provided logs/code; prefer minimal edits; no made-up file paths/services.',
                '',
                'User prompt:',
                userPrompt || '(none)',
                '',
                'Similar past issues:',
                similar
                  .map((i) => `- ${i.id}: ${i.title}\n  signature: ${i.signature}\n  summary: ${i.summary}\n  recommended_fix: ${i.recommendedFix}`)
                  .join('\n') || '- none',
                '',
                'Logs:',
                logs,
                '',
                'Code:',
                snippet
              ].join('\n');

              const parsed = await callOpenAIChat({
                apiKey: openaiKey,
                model: openaiModel,
                messages: [
                  { role: 'system', content: 'You are a senior debugging agent. Be concise and practical.' },
                  { role: 'user', content: agentPrompt }
                ]
              });

              const inputText = `${userPrompt}\n${logs}\n${snippet}`;
              const evidence = Array.isArray(parsed?.evidence) ? parsed.evidence : [];
              const g = computeGroundedness({ input: inputText, evidence });

              const merged = {
                ...local,
                ...parsed,
                source: 'openai-agent-vite',
                similar: similar.length ? similar : local.similar || [],
                evidence,
                groundedness: Number(clamp01(g.groundedness).toFixed(2)),
                groundedness_meta: { matched: g.matched, total: g.total }
              };
              if (merged.groundedness < 0.5) {
                merged.warning = `Low groundedness (${merged.groundedness}). Add more context or ask for clarifying questions.`;
                merged.confidence = Number(Math.min(Number(merged.confidence || 0), 0.45).toFixed(2));
              }
              const fixed = merged.fixed_code || buildFixedCodePreview({ logs, snippet, analysis: merged });
              return sendJson(res, 200, { result: { ...merged, fixed_code: fixed } });
            } catch (err) {
              const detail = String(err?.message || err);
              return sendJson(res, 200, {
                result: {
                  source: 'vite-agent-error',
                  assistant_message: `Vite agent middleware failed; showing local-only result. (${detail})`,
                  steps: ['Catch error', 'Return local fallback'],
                  root_cause: 'Agent middleware failed.',
                  fix: detail,
                  confidence: 0.2,
                  pr_snippet: '',
                  code_snippet: '',
                  fixed_code: '',
                  error_detail: detail
                },
                warning: detail
              });
            }
          });
        }
      }
    ],
    server: {
      port: 5173,
      proxy: {
        // Proxy backend routes during dev so the frontend can call `/auth/*`, `/ai/*`, etc.
        '/auth': { target, changeOrigin: true },
        '/rooms': { target, changeOrigin: true },
        '/github': { target, changeOrigin: true },
        // Back-compat: allow `/api/*` as well.
        '/api': { target, changeOrigin: true, rewrite: (urlPath) => urlPath.replace(/^\/api/, '') }
      }
    }
  };
});
