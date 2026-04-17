import pastIssues from '../data/pastIssues.js';

function normalizeText(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text = '') {
  return normalizeText(text).split(' ').filter(Boolean);
}

function keywordWeight(keyword) {
  const normalized = normalizeText(keyword);
  if (!normalized) return 0;
  if (normalized.includes(' ')) return 1.5;
  if (normalized.length >= 8) return 1.25;
  if (normalized.length >= 5) return 1;
  return 0.6;
}

function phraseScore(haystack, needle, weight) {
  const normalizedNeedle = normalizeText(needle);
  if (!normalizedNeedle) return 0;
  return haystack.includes(normalizedNeedle) ? weight : 0;
}

function scoreIssue(issue, text) {
  if (!text) return 0;
  const haystack = normalizeText(text);
  const tokens = new Set(tokenize(text));
  let score = 0;

  score += phraseScore(haystack, issue.signature, 5);
  score += phraseScore(haystack, issue.logHint, 3);
  score += phraseScore(haystack, issue.title, 2);

  for (const keyword of issue.keywords || []) {
    const normalized = normalizeText(keyword);
    if (normalized && haystack.includes(normalized)) {
      score += keywordWeight(keyword);
    }
  }

  const titleTokens = tokenize(issue.title).filter((token) => token.length > 3);
  const hintTokens = tokenize(issue.logHint).filter((token) => token.length > 3);
  score += titleTokens.filter((token) => tokens.has(token)).length * 0.35;
  score += hintTokens.filter((token) => tokens.has(token)).length * 0.25;

  if (issue.stack && tokens.has(normalizeText(issue.stack))) {
    score += 0.5;
  }

  return Number(score.toFixed(2));
}

export function findSimilarIssues({ logs, snippet, topK = 3, minScore = 1.25 }) {
  const text = `${logs || ''}\n${snippet || ''}`;
  return pastIssues
    .map((issue) => ({ issue, score: scoreIssue(issue, text) }))
    .filter((entry) => entry.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((entry) => entry.issue);
}

const genericRules = [
  {
    id: 'GEN-JS-NULL',
    patterns: [/cannot read properties of undefined/i, /cannot read property/i, /typeerror/i, /undefined is not a function/i],
    rootCause: 'A JavaScript runtime null or undefined access is crashing the code path.',
    fix: 'Initialize the value, add optional chaining or null guards, and avoid dereferencing data before it exists.',
    prDraft: 'Add null guards and safe defaults around the failing property access.',
    codeSnippet: 'const value = data?.item ?? fallback;'
  },
  {
    id: 'GEN-IMPORT',
    patterns: [/modulenotfounderror/i, /cannot find module/i, /cannot find package/i, /no module named/i, /importerror/i],
    rootCause: 'A dependency or import path is missing from the runtime environment.',
    fix: 'Install the missing package, verify the import path, and refresh the lockfile or requirements file.',
    prDraft: 'Add the missing dependency to the environment so the import resolves consistently.',
    codeSnippet: 'python -m pip install <package>'
  },
  {
    id: 'GEN-MONGO',
    patterns: [/mongoserverselectionerror/i, /mongonetworkerror/i, /server selection timed out/i, /authentication failed/i, /could not connect to any servers/i, /topology was destroyed/i, /not authorized/i],
    rootCause: 'The app cannot establish a MongoDB connection, usually because the URI, credentials, IP allowlist, or network path is wrong.',
    fix: 'Move the URI to an environment variable, verify credentials, confirm Atlas IP allowlisting, and remove deprecated connection options.',
    prDraft: 'Move the MongoDB URI into an environment variable, rotate any exposed credentials, and verify the Atlas network settings.',
    codeSnippet: `import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGO_URI);`
  },
  {
    id: 'GEN-SQL',
    patterns: [/syntax error at or near/i, /sqlstate/i, /duplicate key/i, /relation does not exist/i, /unterminated quoted string/i],
    rootCause: 'The SQL query or migration statement is malformed or points to the wrong table or column.',
    fix: 'Use parameterized queries, inspect the final SQL string, and verify quotes, commas, placeholders, and schema names.',
    prDraft: 'Replace raw string-built SQL with parameterized queries and fix the malformed statement.',
    codeSnippet: 'await db.query("select * from users where id = $1", [userId]);'
  },
  {
    id: 'GEN-NETWORK',
    patterns: [/econnrefused/i, /econnreset/i, /socket hang up/i, /timed? out/i, /fetch failed/i, /service unavailable/i],
    rootCause: 'The client cannot reach the target service or the connection is being dropped.',
    fix: 'Verify the service is running, confirm the host and port, and check network, proxy, or firewall settings.',
    prDraft: 'Make the service URL configurable and confirm the backend is reachable on the expected host and port.',
    codeSnippet: 'const api = axios.create({ baseURL: import.meta.env.VITE_API_URL });'
  },
  {
    id: 'GEN-AUTH',
    patterns: [/jwt expired/i, /unauthorized/i, /\b401\b/, /invalid token/i, /token expired/i],
    rootCause: 'The request is failing because the access token is missing, invalid, or expired.',
    fix: 'Refresh the token if supported, re-authenticate the user, and ensure the Authorization header is attached.',
    prDraft: 'Add token refresh or re-login handling so expired auth tokens do not break the flow.',
    codeSnippet: 'api.interceptors.response.use((res) => res, (err) => Promise.reject(err));'
  },
  {
    id: 'GEN-CORS',
    patterns: [/blocked by cors policy/i, /access-control-allow-origin/i, /preflight/i, /cors/i],
    rootCause: 'The browser is blocking a cross-origin request because the API is not sending the required CORS headers.',
    fix: 'Allow the frontend origin on the server, enable credentials only if needed, and handle OPTIONS preflight requests.',
    prDraft: 'Configure server-side CORS for the frontend origin so the browser can complete the request.',
    codeSnippet: 'app.use(cors({ origin: ["http://localhost:5173"], credentials: true }));'
  },
  {
    id: 'GEN-FILE',
    patterns: [/enoent/i, /no such file or directory/i, /file not found/i, /cannot open/i, /path not found/i],
    rootCause: 'The code is reading or writing a file path that does not exist in the current environment.',
    fix: 'Check the path, ensure the file exists in the build or container, and guard the file access with existence checks.',
    prDraft: 'Validate the file path before accessing it and handle missing files gracefully.',
    codeSnippet: 'await fs.access(filePath);'
  },
  {
    id: 'GEN-STACK',
    patterns: [/maximum call stack size exceeded/i, /stack overflow/i, /recursion/i, /infinite loop/i],
    rootCause: 'A recursive function or cyclic update is calling itself without a terminating condition.',
    fix: 'Add a base case, break the cycle, or replace recursion with an iterative loop when the depth can grow large.',
    prDraft: 'Add an explicit base case to stop the recursive loop and prevent the stack overflow.',
    codeSnippet: 'function walk(node, depth = 0) { if (!node || depth > 1000) return; }'
  },
  {
    id: 'GEN-PY-ASYNC',
    patterns: [/asyncio/i, /timeouterror/i, /event loop blocked/i, /slow coroutine/i],
    rootCause: 'A CPU-bound task or slow coroutine is blocking the async event loop.',
    fix: 'Move heavy work to an executor or subprocess, keep coroutines non-blocking, and add timeouts around the slow call.',
    prDraft: 'Offload the heavy routine so the asyncio loop stays responsive and avoids cascading timeouts.',
    codeSnippet: 'result = await loop.run_in_executor(executor, cpu_heavy_fn, payload)'
  }
];

export function inferGenericAnalysis(text) {
  const haystack = normalizeText(text);
  let bestRule = null;
  let bestHits = 0;

  for (const rule of genericRules) {
    const hits = rule.patterns.reduce((count, pattern) => (pattern.test(text) ? count + 1 : count), 0);
    if (hits > bestHits) {
      bestHits = hits;
      bestRule = rule;
    }
  }

  if (!bestRule || bestHits === 0) return null;

  const confidence = Math.min(0.82, 0.46 + bestHits * 0.08);
  const notes = bestRule.patterns
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.source.replace(/\\/g, ''))
    .join(', ');

  return {
    source: 'local-generic',
    root_cause: bestRule.rootCause,
    fix: bestRule.fix,
    confidence: Number(confidence.toFixed(2)),
    pr_snippet: `${bestRule.prDraft}${notes ? ` Matched: ${notes}.` : ''}`,
    code_snippet: bestRule.codeSnippet,
    similar: []
  };
}

function stripDeprecatedMongooseOptions(snippet) {
  // Best-effort cleanup; keep it regex-only so we don't need a JS parser.
  return snippet
    .replace(/\s*,\s*useNewUrlParser\s*:\s*true\s*,?/g, '')
    .replace(/\s*,\s*useUnifiedTopology\s*:\s*true\s*,?/g, '')
    .replace(/\{\s*,/g, '{')
    .replace(/,\s*\}/g, '}');
}

function applyMongoHeuristicFix(snippet) {
  let out = snippet;
  out = out.replace(
    /const\s+dbURI\s*=\s*(['"`])mongodb[^'"`]*\1\s*;/i,
    'const dbURI = process.env.MONGO_URI;'
  );
  out = out.replace(
    /mongoose\.connect\(\s*(['"`])mongodb[^'"`]*\1\s*,/i,
    'mongoose.connect(process.env.MONGO_URI,'
  );
  out = out.replace(
    /mongoose\.connect\(\s*(['"`])mongodb[^'"`]*\1\s*\)/i,
    'mongoose.connect(process.env.MONGO_URI)'
  );
  out = stripDeprecatedMongooseOptions(out);
  return out;
}

function looksMongoRelated({ logs, snippet, analysis }) {
  const blob = `${logs || ''}\n${snippet || ''}\n${analysis?.root_cause || ''}\n${analysis?.fix || ''}`
    .toLowerCase();
  return blob.includes('mongo') || blob.includes('mongoose') || blob.includes('mongodb+srv');
}

export function buildFixedCodePreview({ logs, snippet, analysis }) {
  const rawSnippet = String(snippet || '');
  const trimmedSnippet = rawSnippet.trim();
  const fixText = String(analysis?.fix || '').trim();

  if (trimmedSnippet) {
    let fixed = rawSnippet;
    if (looksMongoRelated({ logs, snippet: rawSnippet, analysis })) {
      fixed = applyMongoHeuristicFix(fixed);
    }
    const header = fixText ? `/* Suggested fix:\n${fixText}\n*/\n\n` : '';
    return `${header}${String(fixed).trim()}\n`;
  }

  const codeHint = String(analysis?.code_snippet || '').trim();
  if (codeHint) return `${codeHint}\n`;

  return `// Paste a code snippet to get a fixed-code preview.\n${fixText ? `// Suggested fix: ${fixText}\n` : ''}`;
}

export function buildLocalAnalysis({ logs, snippet }) {
  const similar = findSimilarIssues({ logs, snippet });
  const top = similar[0];

  if (top) {
    const text = `${logs || ''}\n${snippet || ''}`;
    const matchCount = similar.reduce((count, issue) => {
      return count + (issue.keywords || []).filter((kw) => normalizeText(text).includes(normalizeText(kw))).length;
    }, 0);
    const confidence = Math.min(0.94, 0.42 + matchCount * 0.08);

    return {
      source: 'local',
      root_cause: top.summary,
      fix: top.recommendedFix,
      confidence: Number(confidence.toFixed(2)),
      pr_snippet: top.prDraft,
      code_snippet: top.codePatch || '',
      fixed_code: buildFixedCodePreview({
        logs,
        snippet,
        analysis: { fix: top.recommendedFix, code_snippet: top.codePatch || '', root_cause: top.summary }
      }),
      similar
    };
  }

  const text = `${logs || ''}\n${snippet || ''}`;
  const generic = inferGenericAnalysis(text);
  if (generic) {
    return {
      ...generic,
      fixed_code: buildFixedCodePreview({ logs, snippet, analysis: generic })
    };
  }

  const fallback = {
    source: 'local',
    root_cause:
      'I could not find a strong local match. Add the exact stack trace, error code, or failing line for a better diagnosis.',
    fix: 'Add more diagnostic logs around the failing path and rerun the analysis.',
    confidence: 0.35,
    pr_snippet: 'Add defensive logging around the failing path, then rerun the analyzer to confirm the root cause.',
    code_snippet: '',
    similar: []
  };
  return { ...fallback, fixed_code: buildFixedCodePreview({ logs, snippet, analysis: fallback }) };
}
