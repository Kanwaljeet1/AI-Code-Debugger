import { Router } from 'express';

const router = Router();

function getGithubConfig() {
  const token = process.env.GITHUB_TOKEN?.trim();
  const owner = process.env.GITHUB_OWNER?.trim();
  const repo = process.env.GITHUB_REPO?.trim();
  const apiBase = (process.env.GITHUB_API_BASE || 'https://api.github.com').trim().replace(/\/+$/, '');
  return { token, owner, repo, apiBase };
}

router.get('/status', (_req, res) => {
  const { token, owner, repo, apiBase } = getGithubConfig();
  res.json({
    ok: Boolean(token && owner && repo),
    configured: { owner: owner || '', repo: repo || '', apiBase },
    missing: {
      token: !token,
      owner: !owner,
      repo: !repo
    }
  });
});

router.post('/pr/merge', async (req, res) => {
  const { token, owner, repo, apiBase } = getGithubConfig();
  if (!token || !owner || !repo) {
    return res.status(501).json({
      message: 'GitHub integration not configured. Set GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO.'
    });
  }

  const rawNumber = req.body?.number;
  const pullNumber = Number.parseInt(String(rawNumber || ''), 10);
  if (!Number.isFinite(pullNumber) || pullNumber <= 0) {
    return res.status(400).json({ message: 'Invalid PR number' });
  }

  const method = String(req.body?.method || 'squash').toLowerCase();
  const allowed = new Set(['merge', 'squash', 'rebase']);
  const merge_method = allowed.has(method) ? method : 'squash';

  try {
    const url = `${apiBase}/repos/${owner}/${repo}/pulls/${pullNumber}/merge`;
    const ghRes = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({ merge_method })
    });

    const text = await ghRes.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { raw: text };
    }

    if (!ghRes.ok) {
      return res.status(ghRes.status).json({
        message: payload?.message || 'GitHub merge failed',
        status: ghRes.status,
        error: payload
      });
    }

    return res.json({
      ok: true,
      merged: payload?.merged ?? true,
      method: merge_method,
      github: payload
    });
  } catch (err) {
    return res.status(500).json({ message: 'GitHub request failed', error: err.message });
  }
});

export default router;

