import pastIssues from '../data/pastIssues.js';

let cachedClient = null;

async function getOpenAIClient() {
  if (cachedClient !== null) return cachedClient;
  if (!process.env.OPENAI_API_KEY) {
    cachedClient = null;
    return null;
  }
  try {
    const { default: OpenAI } = await import('openai');
    cachedClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return cachedClient;
  } catch (err) {
    console.error('OpenAI SDK not available. Install with `npm install openai`.', err.message);
    cachedClient = null;
    return null;
  }
}

function scoreIssue(issue, text) {
  if (!text) return 0;
  const haystack = text.toLowerCase();
  let score = 0;
  if (issue.signature && haystack.includes(issue.signature.toLowerCase())) score += 5;
  for (const kw of issue.keywords || []) {
    if (haystack.includes(kw.toLowerCase())) score += 1;
  }
  return score;
}

export function findSimilarIssues({ logs, snippet, topK = 3 }) {
  const text = `${logs || ''}\n${snippet || ''}`;
  const scored = pastIssues
    .map((issue) => ({ issue, score: scoreIssue(issue, text) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((entry) => entry.issue);
  // If nothing matched, still surface the first issue as a generic fallback so UI has content.
  if (scored.length === 0 && pastIssues.length > 0) return [pastIssues[0]];
  return scored;
}

function buildPrompt({ logs, snippet, similar }) {
  const similarBlock = similar
    .map(
      (i) =>
        `- ${i.id}: ${i.title}\n  signature: ${i.signature}\n  summary: ${i.summary}\n  recommended_fix: ${i.recommendedFix}`
    )
    .join('\n');
  return [
    'You are an AI debugging assistant. Given raw logs and an optional code snippet, produce a concise, actionable diagnosis.',
    'Return JSON with keys: root_cause (1-2 sentences), fix (1-3 bullet sentences), confidence (0-1 float), pr_snippet (short PR-ready summary), code_snippet (optional code block string).',
    'Keep it specific to the provided evidence; do not hallucinate services or file paths.',
    'Similar past issues for reference:\n',
    similarBlock || '- none',
    '\nLogs:\n',
    logs || '(no logs provided)',
    '\nCode:\n',
    snippet || '(no code provided)'
  ].join('\n');
}

export function fallbackResponse(similar) {
  const top = similar?.[0];
  return {
    source: 'mock',
    root_cause:
      top?.summary ||
      'Cannot analyze without logs. Provide stack traces or error lines for better results.',
    fix: top?.recommendedFix || 'Add more diagnostic logs and rerun.',
    confidence: 0.42,
    pr_snippet:
      top?.prDraft ||
      'Add a defensive guard and more logging around the failing path to surface root cause.',
    code_snippet: top?.codePatch || ''
  };
}

export async function analyzeDebugRequest({ logs, snippet }) {
  const similar = findSimilarIssues({ logs, snippet });

  const client = await getOpenAIClient();
  if (!client) {
    return { ...fallbackResponse(similar), similar };
  }

  const prompt = buildPrompt({ logs, snippet, similar });
  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a senior debugging assistant. Keep outputs terse and technical.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3
    });
    const parsed = JSON.parse(completion.choices?.[0]?.message?.content || '{}');
    return {
      source: 'openai',
      ...parsed,
      similar
    };
  } catch (err) {
    console.error('OpenAI call failed', err.message);
    return { ...fallbackResponse(similar), similar, error: err.message };
  }
}
