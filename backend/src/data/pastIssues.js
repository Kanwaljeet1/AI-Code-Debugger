const pastIssues = [
  {
    id: 'DX-101',
    title: 'Postgres pool exhausted / ECONNRESET',
    stack: 'node',
    signature: 'remaining connection slots are reserved for non-replication superuser connections',
    keywords: ['ECONNRESET', 'too many clients', 'pg', 'pool', 'connection'],
    logHint: 'PostgresError: remaining connection slots',
    summary:
      'Spikes of ECONNRESET and "remaining connection slots" when the pool size is below concurrent requests. Missing pool re-use or idle timeout cleanup in Node service.',
    recommendedFix:
      'Reuse a single pg Pool per service, cap pool size (e.g., 10), set idleTimeoutMillis, and close clients in finally. Add health check retry/backoff.',
    codePatch: `// example pool reuse
import pg from 'pg';
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 10000
});

export async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}`,
    prDraft:
      'Fix: reuse pg pool, cap pool size to 10, add idle timeout and safe release to prevent ECONNRESET / too-many-clients saturation.'
  },
  {
    id: 'DX-118',
    title: 'React state update on unmounted component',
    stack: 'react',
    signature: 'Warning: Can\'t perform a React state update on an unmounted component',
    keywords: ['state update on unmounted', 'memory leak', 'cleanup', 'useEffect'],
    logHint: 'React state update on unmounted component',
    summary:
      'Async effect resolves after component unmount, causing setState to run without cleanup. Typically from fetch or subscription.',
    recommendedFix:
      'Cancel async work in useEffect cleanup; gate setState with an isMounted flag or AbortController; ensure socket/listener teardown.',
    codePatch: `useEffect(() => {
  let alive = true;
  const controller = new AbortController();

  fetch('/api/data', { signal: controller.signal })
    .then((res) => res.json())
    .then((payload) => { if (alive) setData(payload); })
    .catch((err) => { if (alive && err.name !== 'AbortError') setError(err); });

  return () => { alive = false; controller.abort(); };
}, []);`,
    prDraft:
      'Add cleanup for async effects: abort fetch, guard setState behind mounted flag, and unregister listeners to eliminate unmounted state updates.'
  },
  {
    id: 'DX-203',
    title: 'Python worker: event loop blocked by CPU-heavy task',
    stack: 'python',
    signature: 'asyncio TimeoutError' ,
    keywords: ['asyncio', 'TimeoutError', 'event loop blocked', 'await'],
    logHint: 'asyncio timeout or slow coroutine',
    summary:
      'CPU-bound step running inside async path blocks the loop, producing cascading timeouts. Often fixed by offloading to ThreadPoolExecutor.',
    recommendedFix:
      'Move CPU-bound work to executor or subprocess, keep coroutines non-blocking, add timeout + logging around the heavy call.',
    codePatch: `import asyncio
from concurrent.futures import ThreadPoolExecutor

executor = ThreadPoolExecutor(max_workers=4)

async def handle(payload):
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(executor, cpu_heavy_fn, payload)
    return result`,
    prDraft:
      'Offload CPU-heavy routine to ThreadPoolExecutor to keep asyncio loop responsive and avoid cascading TimeoutError.'
  },
  {
    id: 'DX-305',
    title: 'Node service crash: unhandled promise rejection',
    stack: 'node',
    signature: 'UnhandledPromiseRejectionWarning',
    keywords: ['unhandled', 'promise rejection', 'unhandledrejection', 'process.on'],
    logHint: 'UnhandledPromiseRejectionWarning',
    summary:
      'Promise rejection bubbled to process without catch, causing crash/exit in production when unhandledRejection is fatal.',
    recommendedFix:
      'Add top-level handlers for unhandledRejection + uncaughtException, and ensure awaited calls have try/catch with logging + fail-safe response.',
    codePatch: `process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception', err);
  process.exit(1);
});`,
    prDraft:
      'Add global unhandledRejection/uncaughtException logging and wrap risky awaits to stop crashes from uncaught promise rejections.'
  }
];

export default pastIssues;
