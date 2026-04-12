import { useState } from 'react';
import api from '../api/client.js';

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
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const hue = 120 * (pct / 100); // 0=red,120=green
  const bg = `hsl(${hue}, 65%, 20%)`;
  const border = `hsl(${hue}, 70%, 35%)`;
  return (
    <span className="pill" style={{ background: bg, borderColor: border }}>
      Confidence {pct}%
    </span>
  );
}

export default function DebugAssistant() {
  const [logs, setLogs] = useState(sampleLogs);
  const [snippet, setSnippet] = useState(sampleSnippet);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [showPR, setShowPR] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    try {
      setLoading(true);
      const { data } = await api.post('/ai/debug', { logs, snippet });
      setResult(data.result);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to analyze. Check backend logs.');
    } finally {
      setLoading(false);
    }
  };

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setLogs(reader.result?.toString() || '');
    reader.readAsText(file);
  };

  const copy = (text) => {
    if (!text) return;
    if (navigator?.clipboard) navigator.clipboard.writeText(text);
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel">
        <div className="flex space-between" style={{ marginBottom: 10 }}>
          <div>
            <h2 style={{ margin: 0 }}>AI Debugging Assistant</h2>
            <small className="muted">Paste logs, add an optional code snippet, get root cause + fix.</small>
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
              style={{ minHeight: 220, fontFamily: 'var(--mono)' }}
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
              <small className="muted">{fileName || 'Plain text up to 1MB'}</small>
            </div>
          </div>
          <div>
            <label className="label">Optional code snippet</label>
            <textarea
              className="input"
              style={{ minHeight: 220, fontFamily: 'var(--mono)' }}
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
        {error && <p style={{ color: '#fda4af', marginTop: 10 }}>{error}</p>}
      </div>

      {result && (
        <div className="grid cols-2" style={{ gap: 12 }}>
          <div className="panel">
            <div className="flex space-between" style={{ marginBottom: 6 }}>
              <h3 style={{ margin: 0 }}>Diagnosis</h3>
              <div className="flex" style={{ gap: 8 }}>
                <ConfidencePill value={result.confidence} />
                <span className="badge">{result.source === 'mock' ? 'Mock (no API key)' : 'LLM + memory'}</span>
              </div>
            </div>
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
            {result.code_snippet && (
              <div style={{ marginTop: 12 }}>
                <div className="flex space-between" style={{ marginBottom: 6 }}>
                  <strong>Patch hint</strong>
                  <button className="button inline" type="button" onClick={() => copy(result.code_snippet)}>Copy</button>
                </div>
                <pre className="mono-block">{result.code_snippet}</pre>
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <button className="button inline" type="button" onClick={() => { setShowPR((v) => !v); copy(result.pr_snippet); }}>
                {showPR ? 'Hide PR draft' : 'Generate GitHub PR'}
              </button>
              {showPR && (
                <pre className="mono-block" style={{ marginTop: 8 }}>{result.pr_snippet || 'Add a PR summary here.'}</pre>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="flex space-between" style={{ marginBottom: 8 }}>
              <div>
                <h3 style={{ margin: 0 }}>Similar past issues</h3>
                <small className="muted">Retrieved from local knowledge base</small>
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
                      <strong>{issue.id}: {issue.title}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>{issue.signature}</div>
                      <div style={{ marginTop: 6 }}>{issue.summary}</div>
                      <small className="muted">Keywords: {issue.keywords?.join(', ')}</small>
                    </div>
                    <button className="button inline" type="button" onClick={() => copy(issue.recommendedFix)}>
                      Copy fix
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
