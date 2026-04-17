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
    signature: "Warning: Can't perform a React state update on an unmounted component",
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
    signature: 'asyncio TimeoutError',
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
  },
  {
    id: 'DX-147',
    title: 'MongoDB Atlas URI exposed in source code',
    stack: 'mongodb',
    signature: 'mongoose.connect',
    keywords: ['mongodb+srv', 'mongoose.connect', 'MONGO_URI', 'Atlas', 'server selection timed out', 'authentication failed', 'useNewUrlParser', 'useUnifiedTopology', 'hardcoded credentials'],
    logHint: 'MongoDB connection string in code',
    summary:
      'The database URI and credentials are hardcoded in the source instead of being loaded from an environment variable. That leaks secrets and makes the app harder to deploy safely.',
    recommendedFix:
      'Move the connection string to MONGO_URI, rotate the exposed credentials, remove deprecated connection options, and make sure Atlas allows your IP.',
    codePatch: `import mongoose from 'mongoose';

const dbURI = process.env.MONGO_URI;

mongoose
  .connect(dbURI)
  .then(() => console.log('connected to db'))
  .catch((err) => console.error('Mongo connection failed:', err));`,
    prDraft:
      'Move the MongoDB URI to an environment variable, rotate exposed credentials, and remove deprecated Mongoose connection options.'
  },
  {
    id: 'DX-121',
    title: 'React render crash from undefined data',
    stack: 'react',
    signature: 'Cannot read properties of undefined',
    keywords: ['cannot read properties of undefined', 'reading', 'map', 'length', 'optional chaining', 'null guard'],
    logHint: 'TypeError: Cannot read properties of undefined',
    summary:
      'A component renders before async data is ready, or it dereferences a missing field without a null guard.',
    recommendedFix:
      'Initialize state, use optional chaining or default values, and avoid dereferencing nested fields before data loads.',
    codePatch: `const items = data?.items ?? [];
return <ul>{items.map((item) => <li key={item.id}>{item.name}</li>)}</ul>;`,
    prDraft:
      'Add null guards and safe defaults around render-time data access to prevent undefined property crashes.'
  },
  {
    id: 'DX-214',
    title: 'SQL syntax error in query string',
    stack: 'database',
    signature: 'syntax error at or near',
    keywords: ['sql', 'query', 'postgres', 'mysql', 'syntax error', 'unterminated quoted string', 'sequelize'],
    logHint: 'SQL syntax error at or near',
    summary:
      'The query text is malformed, often because of a missing comma, quote, or string concatenation bug.',
    recommendedFix:
      'Switch to parameterized queries, inspect the final SQL string, and verify quotes, commas, and placeholders.',
    codePatch: `await db.query(
  'select * from users where id = $1 and status = $2',
  [userId, status]
);`,
    prDraft:
      'Replace raw string-built SQL with parameterized queries and fix the malformed clause that triggers the syntax error.'
  },
  {
    id: 'DX-327',
    title: 'Java NullPointerException',
    stack: 'java',
    signature: 'NullPointerException',
    keywords: ['cannot invoke', 'because', 'is null', 'npe', 'spring', 'null pointer'],
    logHint: 'java.lang.NullPointerException',
    summary:
      'A Java object, return value, or dependency is null when code tries to dereference it.',
    recommendedFix:
      'Initialize the object earlier, add null checks, and verify API responses or injected dependencies before use.',
    codePatch: `if (user != null && user.getProfile() != null) {
  return user.getProfile().getName();
}
return "unknown";`,
    prDraft:
      'Add null checks around dereferenced Java objects and guard against missing dependency or API values.'
  },
  {
    id: 'DX-418',
    title: 'Python import / dependency missing',
    stack: 'python',
    signature: 'ModuleNotFoundError',
    keywords: ['no module named', 'importerror', 'module not found', 'pip install', 'requirements', 'venv'],
    logHint: 'ModuleNotFoundError: No module named',
    summary:
      'The runtime environment is missing a Python dependency or the import path is incorrect.',
    recommendedFix:
      'Install the missing package in the active virtual environment, confirm the import path, and refresh the lockfile or requirements file.',
    codePatch: `python -m pip install requests
# or add the dependency to requirements.txt`,
    prDraft:
      'Add the missing Python dependency to the environment and requirements so the import resolves consistently.'
  },
  {
    id: 'DX-503',
    title: 'Port already in use',
    stack: 'node',
    signature: 'EADDRINUSE',
    keywords: ['address already in use', 'port', 'listen', 'already in use', '4000', '5173'],
    logHint: 'listen EADDRINUSE',
    summary:
      'Another process is already bound to the port the app is trying to start on.',
    recommendedFix:
      'Stop the conflicting process, change the port, or make the app read the port from an environment variable.',
    codePatch: `const port = process.env.PORT || 4000;
app.listen(port, () => console.log(\`Listening on \${port}\`));`,
    prDraft:
      'Make the server port configurable and avoid hardcoding a port that conflicts with another running process.'
  },
  {
    id: 'DX-611',
    title: 'CORS blocked browser request',
    stack: 'network',
    signature: "No 'Access-Control-Allow-Origin' header",
    keywords: ['cors', 'access-control-allow-origin', 'preflight', 'options request', 'blocked by cors'],
    logHint: 'blocked by CORS policy',
    summary:
      'The browser is blocking a cross-origin request because the API is not sending the required CORS headers.',
    recommendedFix:
      'Allow the frontend origin on the server, enable credentials only if needed, and handle OPTIONS preflight requests.',
    codePatch: `app.use(cors({
  origin: ['http://localhost:5173'],
  credentials: true
}));`,
    prDraft:
      'Configure server-side CORS for the frontend origin so the browser can complete the cross-origin request.'
  },
  {
    id: 'DX-722',
    title: 'C++ segmentation fault or out-of-bounds access',
    stack: 'cpp',
    signature: 'Segmentation fault',
    keywords: ['segmentation fault', 'core dumped', 'out of bounds', 'vector', 'nullptr', 'heap-buffer-overflow'],
    logHint: 'segmentation fault',
    summary:
      'A C++ pointer, iterator, or array index is invalid, causing an out-of-bounds memory access.',
    recommendedFix:
      'Check bounds before indexing, validate pointers before dereferencing, and inspect the lifetime of referenced objects.',
    codePatch: `if (index >= 0 && index < values.size()) {
  use(values[index]);
}`,
    prDraft:
      'Add bounds checks and null checks around the unsafe C++ memory access to prevent the segmentation fault.'
  },
  {
    id: 'DX-839',
    title: 'JSON parse error from malformed response',
    stack: 'web',
    signature: 'Unexpected token',
    keywords: ['json.parse', 'unexpected token', 'invalid json', 'parse error', 'response was not valid json'],
    logHint: 'Unexpected token in JSON at position',
    summary:
      'The app is trying to parse a response that is not valid JSON, often due to an HTML error page or bad payload shape.',
    recommendedFix:
      'Inspect the raw response body, verify content type, and only parse JSON when the server actually returned JSON.',
    codePatch: `const res = await fetch('/api/data');
const text = await res.text();`,
    prDraft:
      'Handle non-JSON responses safely and avoid blindly parsing an error page as JSON.'
  },
  {
    id: 'DX-904',
    title: 'Auth token expired or invalid',
    stack: 'auth',
    signature: 'jwt expired',
    keywords: ['token expired', 'invalid token', '401', 'unauthorized', 'jwt', 'refresh token'],
    logHint: '401 Unauthorized',
    summary:
      'The request is failing because the access token is expired, invalid, or missing.',
    recommendedFix:
      'Refresh the token if supported, re-authenticate the user, and ensure the client sends the Authorization header.',
    codePatch: `api.interceptors.response.use(
  (res) => res,
  async (err) => {
    // refresh or redirect to login here
    return Promise.reject(err);
  }
);`,
    prDraft:
      'Add token refresh or re-login handling so expired auth tokens do not break the flow.'
  },
  {
    id: 'DX-956',
    title: 'Connection refused to backend service',
    stack: 'network',
    signature: 'ECONNREFUSED',
    keywords: ['connection refused', 'service unavailable', 'timeout', 'socket hang up', 'fetch failed'],
    logHint: 'connect ECONNREFUSED',
    summary:
      'The client cannot reach the service, usually because the server is down or the host/port is wrong.',
    recommendedFix:
      'Verify the backend is running, confirm the host and port, and check firewall or proxy settings.',
    codePatch: `const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000'
});`,
    prDraft:
      'Make the service URL configurable and verify the backend is actually running on the expected host and port.'
  },
  {
    id: 'DX-977',
    title: 'File not found / ENOENT',
    stack: 'node',
    signature: 'ENOENT',
    keywords: ['no such file or directory', 'file not found', 'path', 'fs.readfile', 'cannot open'],
    logHint: 'ENOENT: no such file or directory',
    summary:
      'The code is reading or writing a file path that does not exist in the current runtime environment.',
    recommendedFix:
      'Check the file path, ensure the file is included in the build or container, and guard the file access with existence checks.',
    codePatch: `import fs from 'fs/promises';
await fs.access(filePath);`,
    prDraft:
      'Validate the file path before accessing it and handle missing files gracefully.'
  },
  {
    id: 'DX-1001',
    title: 'Maximum call stack size exceeded',
    stack: 'javascript',
    signature: 'Maximum call stack size exceeded',
    keywords: ['call stack', 'recursion', 'stack overflow', 'recursive', 'infinite loop'],
    logHint: 'Maximum call stack size exceeded',
    summary:
      'A recursive function or cyclic update is calling itself too many times without a terminating condition.',
    recommendedFix:
      'Add a base case, break the cycle, or replace recursion with an iterative loop when the depth can grow large.',
    codePatch: `function walk(node, depth = 0) {
  if (!node || depth > 1000) return;
  return walk(node.next, depth + 1);
}`,
    prDraft:
      'Add an explicit base case to stop the recursive loop and prevent the stack overflow.'
  }
];

export default pastIssues;
