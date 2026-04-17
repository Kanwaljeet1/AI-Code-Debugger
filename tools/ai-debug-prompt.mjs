#!/usr/bin/env node
/**
 * Prompt-style CLI for the AI Debugging Assistant.
 *
 * Lets you paste logs/snippets directly into the terminal (no files needed).
 *
 * Usage:
 *   node tools/ai-debug-prompt.mjs
 *
 * Tip:
 *   Paste multi-line input, then end with a line containing only: END
 */

import readline from 'readline';
import process from 'process';

import { buildFixedCodePreview, buildLocalAnalysis } from '../frontend/src/utils/debugAnalysis.js';

function confidencePct(conf) {
  const n = Math.max(0, Math.min(1, Number(conf || 0)));
  return `${Math.round(n * 100)}%`;
}

function trimBlock(text) {
  return String(text || '').replace(/\s+$/g, '');
}

function hr() {
  return '------------------------------------------------------------';
}

function makeRl() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  });
}

function ask(rl, q) {
  return new Promise((resolve) => rl.question(q, resolve));
}

async function readMultiline(rl, header) {
  console.log('');
  console.log(header);
  console.log('Finish by typing a line with only: END');
  console.log(hr());

  const lines = [];
  // Temporarily handle "line" events so the user can paste multi-line blocks.
  const text = await new Promise((resolve) => {
    const onLine = (line) => {
      if (line === 'END') {
        rl.off('line', onLine);
        resolve(lines.join('\n'));
        return;
      }
      lines.push(line);
    };
    rl.on('line', onLine);
  });

  console.log(hr());
  return text;
}

function printResult(result) {
  console.log('');
  console.log(`[result] source=${result.source || 'local'} confidence=${confidencePct(result.confidence)}`);
  console.log(`root_cause: ${trimBlock(result.root_cause) || 'N/A'}`);
  console.log(`fix: ${trimBlock(result.fix) || 'N/A'}`);

  if (Array.isArray(result.similar) && result.similar.length) {
    console.log(`similar: ${result.similar.map((i) => i.id).join(', ')}`);
  }

  console.log('');
  console.log('[fixed_code]');
  console.log(hr());
  console.log(trimBlock(result.fixed_code || result.code_snippet || '') || '// (no fixed code preview)');
  console.log(hr());

  if (result.pr_snippet) {
    console.log('');
    console.log('[pr_summary]');
    console.log(hr());
    console.log(trimBlock(result.pr_snippet));
    console.log(hr());
  }
}

async function runOnce({ logs, snippet }) {
  const base = buildLocalAnalysis({ logs, snippet });
  const fixed = base.fixed_code || buildFixedCodePreview({ logs, snippet, analysis: base });
  const result = { ...base, fixed_code: fixed };
  printResult(result);
}

async function main() {
  if (!process.stdin.isTTY) {
    // Allow piping logs: cat build.log | node tools/ai-debug-prompt.mjs
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    const logs = Buffer.concat(chunks).toString('utf8');
    await runOnce({ logs, snippet: '' });
    return;
  }

  const rl = makeRl();
  try {
    console.log('AI Debugging Assistant (Prompt Mode)');
    console.log('Paste logs and optional code snippet. Type END on its own line to finish each section.');

    while (true) {
      const logs = await readMultiline(rl, 'Paste logs (required):');
      const wantSnippet = (await ask(rl, '\nAdd a code snippet too? (y/N): ')).trim().toLowerCase();
      let snippet = '';
      if (wantSnippet === 'y' || wantSnippet === 'yes') {
        snippet = await readMultiline(rl, 'Paste code snippet (optional):');
      }

      await runOnce({ logs, snippet });

      const again = (await ask(rl, '\nAnalyze another? (y/N): ')).trim().toLowerCase();
      if (!(again === 'y' || again === 'yes')) break;
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error('Prompt tool failed:', err.message);
  process.exit(1);
});

