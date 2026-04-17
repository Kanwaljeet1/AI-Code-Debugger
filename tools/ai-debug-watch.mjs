#!/usr/bin/env node
/**
 * Editor-agnostic watcher for the AI Debugging Assistant.
 *
 * Watches a logs file (and optional code snippet file) and prints a structured
 * diagnosis every time the inputs change.
 *
 * Usage:
 *   node tools/ai-debug-watch.mjs --logs ./logs.txt --snippet ./snippet.js
 *
 * Output files:
 *   --out-json ./debug-result.json
 *   --out-fixed ./fixed-code.txt
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import process from 'process';

import { buildFixedCodePreview, buildLocalAnalysis } from '../frontend/src/utils/debugAnalysis.js';

function parseArgs(argv) {
  const args = {
    logs: '',
    snippet: '',
    outJson: '',
    outFixed: '',
    once: false,
    debounceMs: 350
  };

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--logs') args.logs = argv[++i] || '';
    else if (a === '--snippet') args.snippet = argv[++i] || '';
    else if (a === '--out-json') args.outJson = argv[++i] || '';
    else if (a === '--out-fixed') args.outFixed = argv[++i] || '';
    else if (a === '--once') args.once = true;
    else if (a === '--debounce-ms') args.debounceMs = Number(argv[++i] || '350');
    else if (a === '-h' || a === '--help') args.help = true;
  }

  return args;
}

function printHelp() {
  // Keep this short and copy-pasteable.
  console.log([
    'AI Debug Watcher',
    '',
    'Required:',
    '  --logs <path>           Path to a text log file to watch',
    '',
    'Optional:',
    '  --snippet <path>        Path to a code snippet file to watch',
    '  --out-json <path>       Write the latest result as JSON',
    '  --out-fixed <path>      Write the fixed-code preview',
    '  --once                  Run once and exit',
    '  --debounce-ms <n>       Debounce change events (default 350)',
    '',
    'Example:',
    '  node tools/ai-debug-watch.mjs --logs ./logs.txt --snippet ./snippet.js --out-fixed ./fixed.txt'
  ].join('\n'));
}

async function readText(filePath) {
  if (!filePath) return '';
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return '';
    throw err;
  }
}

async function writeText(filePath, text) {
  if (!filePath) return;
  await fs.mkdir(path.dirname(path.resolve(filePath)), { recursive: true });
  await fs.writeFile(filePath, text, 'utf8');
}

async function writeJson(filePath, data) {
  if (!filePath) return;
  await fs.mkdir(path.dirname(path.resolve(filePath)), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function nowStamp() {
  return new Date().toISOString();
}

function prettyOneLine(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function confidencePct(conf) {
  const n = Math.max(0, Math.min(1, Number(conf || 0)));
  return `${Math.round(n * 100)}%`;
}

async function analyzeOnce({ logsPath, snippetPath, outJson, outFixed }) {
  const logs = await readText(logsPath);
  const snippet = await readText(snippetPath);

  const base = buildLocalAnalysis({ logs, snippet });
  const fixed = base.fixed_code || buildFixedCodePreview({ logs, snippet, analysis: base });

  const result = {
    ...base,
    fixed_code: fixed,
    meta: {
      ranAt: nowStamp(),
      logsPath: logsPath || '',
      snippetPath: snippetPath || ''
    }
  };

  // Human-friendly console output (brief), plus full JSON if requested.
  const header = `[${result.meta.ranAt}] ${result.source || 'local'} confidence=${confidencePct(result.confidence)}`;
  console.log(header);
  console.log(`root_cause: ${prettyOneLine(result.root_cause) || 'N/A'}`);
  console.log(`fix: ${prettyOneLine(result.fix) || 'N/A'}`);
  if (result.similar?.length) {
    console.log(`similar: ${result.similar.map((i) => i.id).join(', ')}`);
  }
  console.log('');

  await writeJson(outJson, result);
  await writeText(outFixed, fixed);
}

function watchFile(filePath, onChange) {
  if (!filePath) return () => {};
  const abs = path.resolve(filePath);
  let watcher = null;

  // If the file doesn't exist yet, watch the directory until it appears.
  const dir = path.dirname(abs);
  const base = path.basename(abs);

  function attachFileWatch() {
    if (watcher) return;
    try {
      watcher = fsSync.watch(abs, { persistent: true }, () => onChange());
    } catch {
      // File may not exist yet.
    }
  }

  function attachDirWatch() {
    try {
      const dirWatcher = fsSync.watch(dir, { persistent: true }, (_evt, filename) => {
        if (filename && String(filename) === base) {
          onChange();
          attachFileWatch();
        }
      });
      return dirWatcher;
    } catch {
      return null;
    }
  }

  attachFileWatch();
  const dirWatcher = attachDirWatch();

  return () => {
    try { watcher?.close(); } catch {}
    try { dirWatcher?.close(); } catch {}
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.logs) {
    printHelp();
    process.exit(args.help ? 0 : 2);
  }

  const logsPath = args.logs;
  const snippetPath = args.snippet;

  let timer = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      analyzeOnce({
        logsPath,
        snippetPath,
        outJson: args.outJson,
        outFixed: args.outFixed
      }).catch((err) => {
        console.error(`[${nowStamp()}] analyze failed:`, err.message);
      });
    }, Number.isFinite(args.debounceMs) ? args.debounceMs : 350);
  };

  await analyzeOnce({
    logsPath,
    snippetPath,
    outJson: args.outJson,
    outFixed: args.outFixed
  });

  if (args.once) return;

  console.log(`Watching: ${path.resolve(logsPath)}${snippetPath ? ` and ${path.resolve(snippetPath)}` : ''}`);
  console.log('Tip: write new errors into the logs file; this will auto-run.\n');

  const unwatchLogs = watchFile(logsPath, schedule);
  const unwatchSnippet = watchFile(snippetPath, schedule);

  process.on('SIGINT', () => {
    unwatchLogs();
    unwatchSnippet();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

