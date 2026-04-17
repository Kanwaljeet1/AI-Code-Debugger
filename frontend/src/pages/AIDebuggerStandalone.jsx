import { useEffect, useRef, useState } from 'react';
import api from '../api/client.js';
import { buildFixedCodePreview, buildLocalAnalysis } from '../utils/debugAnalysis.js';

const sampleLogs = `2024-11-04T08:22:10Z worker[api]: error: UnhandledPromiseRejectionWarning: Error: connect ECONNRESET
    at TCP.onStreamRead (internal/stream_base_commons.js:209:20)
Caused by: remaining connection slots are reserved for non-replication superuser connections
`;

const sampleSnippet = `import pg from 'pg';
// intentionally opening a new client per request (bug)
export async function handler() {
  const client = new pg.Client(process.env.DATABASE_URL);
  await client.connect();
  return client.query('select 1');
}`;

function ConfidencePill({ value = 0 }) {
  const pct = Math.round(Math.max(0, Math.min(1, value || 0)) * 100);
  const hue = 120 * (pct / 100);
  const bg = `hsl(${hue}, 65%, 20%)`;
  const border = `hsl(${hue}, 70%, 35%)`;
  return (
    <span className="pill" style={{ background: bg, borderColor: border }}>
      Confidence {pct}%
    </span>
  );
}

function GroundednessPill({ value }) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return (
      <span className="pill" style={{ background: 'rgba(148,163,184,0.12)', borderColor: 'rgba(148,163,184,0.35)' }}>
        Grounded N/A
      </span>
    );
  }
  const pct = Math.round(Math.max(0, Math.min(1, Number(value))) * 100);
  const hue = 120 * (pct / 100);
  const bg = `hsl(${hue}, 55%, 18%)`;
  const border = `hsl(${hue}, 65%, 32%)`;
  return (
    <span className="pill" style={{ background: bg, borderColor: border }}>
      Grounded {pct}%
    </span>
  );
}

function ResultCard({ result, onCopy }) {
  if (!result) return null;
  const sourceLabel =
    result.source === 'backend'
      ? 'Backend + recall'
      : result.source === 'openai'
        ? 'OpenAI + recall'
        : result.source === 'local-generic'
          ? 'Generic bug pattern'
        : result.source === 'local'
          ? 'Local recall'
          : result.source === 'mock'
            ? 'Mock (no API key)'
            : 'Debug result';
  return (
    <div className="grid cols-2" style={{ gap: 12 }}>
      <div className="panel">
        <div className="flex space-between" style={{ marginBottom: 6 }}>
          <h3 style={{ margin: 0 }}>Diagnosis</h3>
          <div className="flex" style={{ gap: 8 }}>
            <ConfidencePill value={result.confidence} />
            <GroundednessPill value={result.groundedness} />
            <span className="badge">{sourceLabel}</span>
          </div>
        </div>
        {result.warning && (
          <p style={{ color: '#fda4af', marginTop: 0, marginBottom: 10 }}>
            {result.warning}
          </p>
        )}
        <div className="grid" style={{ gap: 10 }}>
          <div className="stat-card">
            <small className="muted">Root cause</small>
            <div>{result.root_cause || 'N/A'}</div>
          </div>
          <div className="stat-card">
            <small className="muted">Suggested fix</small>
            <div>{result.fix || 'N/A'}</div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div className="flex space-between" style={{ marginBottom: 6 }}>
            <strong>Fixed code preview</strong>
            <button className="button inline" type="button" onClick={() => onCopy(result.fixed_code || result.code_snippet || '')}>Copy</button>
          </div>
          <pre className="mono-block">{result.fixed_code || result.code_snippet || '// Paste a code snippet to see a fixed-code preview.'}</pre>
        </div>
        {Array.isArray(result.evidence) && result.evidence.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="flex space-between" style={{ marginBottom: 6 }}>
              <strong>Evidence (from your input)</strong>
              <button className="button inline" type="button" onClick={() => onCopy(result.evidence.join('\n'))}>Copy</button>
            </div>
            <div className="mono-block">
              {result.evidence.map((q, idx) => (
                <div key={idx} style={{ marginBottom: 8 }}>
                  <div className="muted" style={{ fontSize: 12 }}>Quote {idx + 1}</div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{q}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {result.pr_snippet && (
          <div style={{ marginTop: 12 }}>
            <div className="flex space-between" style={{ marginBottom: 6 }}>
              <strong>PR-ready summary</strong>
              <button className="button inline" type="button" onClick={() => onCopy(result.pr_snippet)}>Copy</button>
            </div>
            <pre className="mono-block">{result.pr_snippet}</pre>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="flex space-between" style={{ marginBottom: 8 }}>
          <div>
            <h3 style={{ margin: 0 }}>Similar past issues</h3>
            <small className="muted">Local JSON recall</small>
          </div>
          <span className="badge">{(result.similar || []).length} matches</span>
        </div>
        {(result.similar || []).length === 0 ? (
          <p className="muted">No matches yet. Add more logs for better recall.</p>
        ) : (
          <div className="list">
                {result.similar.map((issue) => (
                  <div className="list-item" key={issue.id} style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div className="flex" style={{ gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <strong>{issue.id}: {issue.title}</strong>
                        <span className="badge">{issue.stack || 'general'}</span>
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>{issue.signature}</div>
                      <div style={{ marginTop: 6 }}>{issue.summary}</div>
                      <small className="muted">Keywords: {issue.keywords?.join(', ')}</small>
                    </div>
                <button className="button inline" type="button" onClick={() => onCopy(issue.recommendedFix)}>
                  Copy fix
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AgentChat({ logs, snippet, backendEnabled, onAdoptFixedCode, onSetResult }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Paste logs and code, then ask me to diagnose or fix. Example: "Fix this error and show the corrected code".' }
  ]);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState('');

  const send = async () => {
    const userText = String(prompt || '').trim();
    if (!userText) return;
    setPrompt('');
    setBusy(true);
    setLastError('');
    setMessages((prev) => [...prev, { role: 'user', content: userText }, { role: 'assistant', content: 'Thinking…' }]);

    try {
      if (!backendEnabled) {
        const local = buildLocalAnalysis({ logs, snippet });
        const fixedCode = buildFixedCodePreview({ logs, snippet, analysis: local });
        const merged = { ...local, fixed_code: local.fixed_code || fixedCode, source: local.source || 'local' };
        onSetResult?.(merged);
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            role: 'assistant',
            content: `Backend GenAI is disabled. Showing local analysis.\n\nRoot cause: ${local.root_cause || 'N/A'}\nFix: ${local.fix || 'N/A'}`,
            meta: merged
          };
          return next;
        });
        return;
      }

      const { data } = await api.post('/ai/agent', { prompt: userText, logs, snippet });
      const r = data?.result || {};
      const fixedCode = buildFixedCodePreview({ logs, snippet, analysis: r });
      const merged = { ...r, fixed_code: r.fixed_code || fixedCode };
      onSetResult?.(merged);

      const detail = r.error_detail || r.warning || '';
      if (r.source && String(r.source).includes('error') && detail) setLastError(String(detail));

      const assistantMessage = (() => {
        const base =
          r.assistant_message ||
          `Root cause: ${r.root_cause || 'N/A'}\nFix: ${r.fix || 'N/A'}\nConfidence: ${Math.round((r.confidence || 0) * 100)}%`;
        if (!detail) return base;
        // Avoid duplicating detail if already embedded.
        if (String(base).includes(detail)) return base;
        return `${base}\n\nDetails: ${detail}`;
      })();

      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: assistantMessage, meta: merged };
        return next;
      });
    } catch (err) {
      const detail =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Unknown error';
      setLastError(detail);

      // Fall back to local analysis so "Ask" still produces something useful.
      const local = buildLocalAnalysis({ logs, snippet });
      const fixedCode = buildFixedCodePreview({ logs, snippet, analysis: local });
      const merged = { ...local, fixed_code: local.fixed_code || fixedCode, source: local.source || 'local' };
      onSetResult?.(merged);

      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role: 'assistant',
          content: `Agent failed (${detail}). Showing local analysis.\n\nRoot cause: ${local.root_cause || 'N/A'}\nFix: ${local.fix || 'N/A'}`,
          meta: merged
        };
        return next;
      });
    } finally {
      setBusy(false);
    }
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && m.meta);
  const lastMeta = lastAssistant?.meta;

  return (
    <div className="panel">
      <div className="flex space-between" style={{ marginBottom: 8 }}>
        <div>
          <h3 style={{ margin: 0 }}>Debug Prompt</h3>
          <small className="muted">Agentic chat over your logs and snippet. Returns steps and fixed code.</small>
        </div>
        {lastMeta?.fixed_code && (
          <button className="button inline" type="button" onClick={() => onAdoptFixedCode(lastMeta.fixed_code)}>
            Apply fixed code
          </button>
        )}
      </div>
      {lastError && (
        <p style={{ color: '#fda4af', marginTop: 0, marginBottom: 10 }}>
          Agent error: {lastError}
        </p>
      )}

      <div className="mono-block" style={{ maxHeight: 240, overflow: 'auto' }}>
        {messages.map((m, idx) => (
          <div key={idx} style={{ marginBottom: 10 }}>
            <div className="muted" style={{ fontSize: 12 }}>{m.role === 'user' ? 'You' : 'Assistant'}</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
            {m.meta?.steps?.length ? (
              <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                Steps: {Array.isArray(m.meta.steps) ? m.meta.steps.join(' | ') : String(m.meta.steps)}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex" style={{ gap: 8, marginTop: 10 }}>
        <input
          className="input"
          placeholder='Try: "Diagnose this", "Fix it", "Rewrite with env vars", "Generate a PR summary"...'
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (!busy) send();
            }
          }}
        />
        <button className="button primary" type="button" onClick={send} disabled={busy}>
          {busy ? 'Working…' : 'Ask'}
        </button>
      </div>
    </div>
  );
}

function ghMergeFlag(method) {
  if (method === 'merge') return '--merge';
  if (method === 'rebase') return '--rebase';
  return '--squash';
}

function parsePullUrl(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!url.hostname.endsWith('github.com')) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    // /:owner/:repo/pull/:number
    if (parts.length >= 4 && parts[2] === 'pull') {
      const owner = parts[0];
      const repo = parts[1];
      const number = Number.parseInt(parts[3], 10);
      if (owner && repo && Number.isFinite(number) && number > 0) return { owner, repo, number };
    }
  } catch {
    return null;
  }
  return null;
}

function MergePRCard({ defaultMethod = 'squash' }) {
  const [mode, setMode] = useState('auto'); // auto | backend | browser | cli
  const [prRef, setPrRef] = useState('');
  const [method, setMethod] = useState(defaultMethod);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [token, setToken] = useState('');

  const copy = async (text) => {
    try {
      await navigator?.clipboard?.writeText(text);
    } catch {
      // ignore
    }
  };

  const resolved = (() => {
    const fromUrl = parsePullUrl(prRef);
    if (fromUrl) return { owner: fromUrl.owner, repo: fromUrl.repo, number: String(fromUrl.number) };
    return { owner: owner.trim(), repo: repo.trim(), number: prRef.trim() };
  })();

  const activeMode = (() => {
    if (mode !== 'auto') return mode;
    // If user provided a token + owner/repo, default to browser mode.
    if (token.trim() && resolved.owner && resolved.repo) return 'browser';
    // Otherwise try backend first; if it fails we'll fall back to CLI.
    return 'backend';
  })();

  async function mergeViaBrowser() {
    if (!token.trim()) {
      setStatus('Add a GitHub token to merge in-browser.');
      return;
    }
    if (!resolved.owner || !resolved.repo) {
      setStatus('Add owner + repo (or paste a PR URL) to merge in-browser.');
      return;
    }
    if (!resolved.number) {
      setStatus('Enter a PR number (or paste a PR URL) first.');
      return;
    }

    const merge_method = method === 'merge' || method === 'rebase' ? method : 'squash';
    const url = `https://api.github.com/repos/${resolved.owner}/${resolved.repo}/pulls/${resolved.number}/merge`;

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({ merge_method })
    });

    const text = await res.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { raw: text };
    }

    if (!res.ok) {
      setStatus(payload?.message ? `GitHub merge failed: ${payload.message}` : `GitHub merge failed (${res.status}).`);
      return;
    }

    setStatus(`Merged PR #${resolved.number} (${merge_method}).`);
  }

  const merge = async () => {
    const num = String(resolved.number || '').trim();
    if (!num) return setStatus('Enter a PR number (or paste a PR URL) first.');
    setBusy(true);
    setStatus('');
    try {
      if (activeMode === 'browser') {
        await mergeViaBrowser();
      } else if (activeMode === 'cli') {
        const cmd = `gh pr merge ${num} ${ghMergeFlag(method)}`;
        await copy(cmd);
        setStatus(`Copied command: ${cmd}`);
      } else {
        const { data } = await api.post('/github/pr/merge', { number: num, method });
        if (data?.ok) {
          setStatus(`Merged PR #${num} (${data.method}).`);
        } else {
          setStatus('Merge failed.');
        }
      }
    } catch (err) {
      // If backend isn't reachable/configured, fall back to browser merge (if token present) or CLI copy.
      if (activeMode === 'backend' && token.trim() && resolved.owner && resolved.repo) {
        try {
          await mergeViaBrowser();
          return;
        } catch {
          // fall through to CLI copy
        }
      }
      const cmd = `gh pr merge ${num} ${ghMergeFlag(method)}`;
      await copy(cmd);
      setStatus(`Backend merge unavailable. Copied command: ${cmd}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <div className="flex space-between" style={{ marginBottom: 8 }}>
        <div>
          <h3 style={{ margin: 0 }}>Merge PR</h3>
          <small className="muted">Backend merge, browser merge (token), or copy `gh` command.</small>
        </div>
        <button className="button inline" type="button" onClick={merge} disabled={busy}>
          {busy ? 'Merging…' : 'Merge PR'}
        </button>
      </div>
      <div className="grid cols-2" style={{ gap: 10 }}>
        <div>
          <label className="label">PR number or URL</label>
          <input className="input" placeholder="123 or https://github.com/org/repo/pull/123" value={prRef} onChange={(e) => setPrRef(e.target.value)} />
        </div>
        <div>
          <label className="label">Method</label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="squash">Squash</option>
            <option value="merge">Merge</option>
            <option value="rebase">Rebase</option>
          </select>
        </div>
      </div>
      <div className="grid cols-2" style={{ gap: 10, marginTop: 10 }}>
        <div>
          <label className="label">Mode</label>
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="auto">Auto</option>
            <option value="backend">Backend</option>
            <option value="browser">Browser (token)</option>
            <option value="cli">CLI (copy command)</option>
          </select>
        </div>
        <div />
      </div>
      {(activeMode === 'browser' || mode === 'browser') && (
        <div className="grid cols-2" style={{ gap: 10, marginTop: 10 }}>
          <div>
            <label className="label">Owner</label>
            <input className="input" placeholder="org" value={owner} onChange={(e) => setOwner(e.target.value)} />
          </div>
          <div>
            <label className="label">Repo</label>
            <input className="input" placeholder="repo" value={repo} onChange={(e) => setRepo(e.target.value)} />
          </div>
          <div className="grid" style={{ gridColumn: '1 / -1' }}>
            <label className="label">GitHub token</label>
            <input className="input" placeholder="ghp_... (not saved)" value={token} onChange={(e) => setToken(e.target.value)} />
          </div>
        </div>
      )}
      {status && <p className="muted" style={{ marginTop: 10 }}>{status}</p>}
    </div>
  );
}

export default function AIDebuggerStandalone() {
  const [logs, setLogs] = useState(sampleLogs);
  const [snippet, setSnippet] = useState(sampleSnippet);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [backendNote, setBackendNote] = useState('');
  const [backendState, setBackendState] = useState('unknown'); // unknown | ok | error | cooldown
  const [backendDetail, setBackendDetail] = useState('');
  const [backendCooldownUntil, setBackendCooldownUntil] = useState(0);
  const [fileName, setFileName] = useState('');
  const [autopilot, setAutopilot] = useState(true);
  const [useBackendAI, setUseBackendAI] = useState(Boolean(import.meta.env.DEV));
  const [lastRunAt, setLastRunAt] = useState('');
  const debounceRef = useRef(null);

  const copy = (text) => {
    if (!text) return;
    navigator?.clipboard?.writeText(text);
  };

  const analyze = async ({ allowBackend = true } = {}) => {
    setError('');
    if (allowBackend) setBackendNote('');
    const localResult = buildLocalAnalysis({ logs, snippet });
    setResult({
      ...localResult,
      fixed_code: localResult.fixed_code || buildFixedCodePreview({ logs, snippet, analysis: localResult })
    });
    setLastRunAt(new Date().toISOString());
    try {
      if (!allowBackend) return;
      if (!useBackendAI) {
        setBackendState('disabled');
        setBackendDetail('');
        setBackendNote('Backend GenAI is disabled. Showing local analysis.');
        return;
      }
      const now = Date.now();
      if (backendCooldownUntil && now < backendCooldownUntil) {
        setBackendState('cooldown');
        setBackendNote(`Backend calls paused for ${(Math.ceil((backendCooldownUntil - now) / 1000))}s (previous error).`);
        return;
      }
      setLoading(true);
      const { data } = await api.post('/ai/debug', { logs, snippet });
      setBackendState('ok');
      setBackendDetail('');
      if (data?.warning) setBackendNote(String(data.warning));
      if (data?.result) {
        const merged = {
          ...localResult,
          ...data.result,
          source: data.result.source || 'backend',
          similar: data.result.similar?.length ? data.result.similar : localResult.similar
        };
        setResult({
          ...merged,
          fixed_code: buildFixedCodePreview({ logs, snippet, analysis: merged })
        });
      }
    } catch (err) {
      const status = err?.response?.status;
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Unknown error';
      const detail = `status=${status || 'n/a'} message=${msg}`;
      setBackendState('error');
      setBackendDetail(detail);
      setBackendNote(`Backend analysis failed (${detail}). Showing local analysis.`);
      setError(`Backend offline: ${msg}`);
      // Avoid hammering the proxy/backend when it is down.
      setBackendCooldownUntil(Date.now() + 30_000);
    } finally {
      setLoading(false);
    }
  };

  const adoptFixedCode = (fixedCode) => {
    if (!fixedCode) return;
    setSnippet(String(fixedCode));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    await analyze({ allowBackend: true });
  };

  useEffect(() => {
    if (!autopilot) return;
    // Autopilot: run locally immediately, then optionally ask backend after debounce.
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Always keep the UI responsive with local results.
    analyze({ allowBackend: false });
    debounceRef.current = setTimeout(() => {
      analyze({ allowBackend: true });
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, snippet, autopilot, useBackendAI]);

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setLogs(reader.result?.toString() || '');
    reader.readAsText(file);
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel">
        <div className="flex space-between" style={{ marginBottom: 10 }}>
          <div>
            <h2 style={{ margin: 0 }}>AI Debugging Assistant</h2>
            <small className="muted">Paste logs + optional code → root cause, fix, confidence, PR text.</small>
            <div className="flex" style={{ gap: 10, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <label className="flex" style={{ gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={autopilot}
                  onChange={(e) => setAutopilot(e.target.checked)}
                />
                <small className="muted">Autopilot (auto-analyze while you type)</small>
              </label>
              <label className="flex" style={{ gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={useBackendAI}
                  onChange={(e) => setUseBackendAI(e.target.checked)}
                />
                <small className="muted">Use backend GenAI</small>
              </label>
              <span className="badge">
                Backend: {useBackendAI ? backendState : 'disabled'}
              </span>
              {lastRunAt && (
                <small className="muted">
                  Last run: {new Date(lastRunAt).toLocaleTimeString()}
                </small>
              )}
            </div>
          </div>
          <div className="flex" style={{ gap: 8 }}>
            <button type="button" className="button inline" onClick={() => { setLogs(sampleLogs); setSnippet(sampleSnippet); }}>
              Load sample
            </button>
            <button type="button" className="button inline" onClick={() => { setLogs(''); setSnippet(''); setResult(null); }}>
              Clear
            </button>
          </div>
        </div>
        <form onSubmit={onSubmit} className="grid cols-2" style={{ gap: 14 }}>
          <div>
            <label className="label">Logs (paste or upload)</label>
            <textarea
              className="input"
              style={{ minHeight: 240, fontFamily: 'var(--mono)' }}
              placeholder="Stack traces, error lines, request IDs..."
              value={logs}
              onChange={(e) => setLogs(e.target.value)}
              required
            />
            <div className="flex" style={{ justifyContent: 'space-between', marginTop: 6 }}>
              <label className="button inline" style={{ cursor: 'pointer' }}>
                Upload log file
                <input type="file" accept=".log,.txt" style={{ display: 'none' }} onChange={handleFile} />
              </label>
              <small className="muted">{fileName || 'Plain text up to ~1MB'}</small>
            </div>
          </div>
          <div>
            <label className="label">Optional code snippet</label>
            <textarea
              className="input"
              style={{ minHeight: 240, fontFamily: 'var(--mono)' }}
              placeholder="Paste the suspected function or handler"
              value={snippet}
              onChange={(e) => setSnippet(e.target.value)}
            />
            <div className="flex space-between" style={{ marginTop: 6 }}>
              <span />
              <button className="button primary" type="submit" disabled={loading}>
                {loading ? 'Analyzing…' : 'Analyze logs'}
              </button>
            </div>
          </div>
        </form>
        {backendNote && (
          <p className="muted" style={{ marginTop: 10 }}>
            {backendNote}
            {backendDetail ? ` (${backendDetail})` : ''}
          </p>
        )}
        {error && <p style={{ color: '#fda4af', marginTop: 10 }}>{error}</p>}
      </div>

      <ResultCard result={result} onCopy={copy} />
      <AgentChat
        logs={logs}
        snippet={snippet}
        backendEnabled={useBackendAI}
        onAdoptFixedCode={adoptFixedCode}
        onSetResult={(r) => setResult({ ...r, fixed_code: r.fixed_code || buildFixedCodePreview({ logs, snippet, analysis: r }) })}
      />
      <MergePRCard />
    </div>
  );
}
