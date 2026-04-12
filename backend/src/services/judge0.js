import axios from 'axios';

const LANGUAGE_MAP = {
  javascript: 63,
  typescript: 74,
  python: 71,
  cpp: 54,
  java: 62
};

export async function submitToJudge0({ code, language = 'javascript', stdin = '' }) {
  const baseUrl = process.env.JUDGE0_URL || 'https://judge0-ce.p.rapidapi.com';
  const url = `${baseUrl.replace(/\/$/, '')}/submissions?base64_encoded=false&wait=true`;
  const payload = {
    source_code: code,
    language_id: LANGUAGE_MAP[language] || LANGUAGE_MAP.javascript,
    stdin
  };

  const headers = {};
  if (process.env.RAPIDAPI_KEY) {
    headers['X-RapidAPI-Key'] = process.env.RAPIDAPI_KEY;
    headers['X-RapidAPI-Host'] = new URL(baseUrl).host;
  }

  const { data } = await axios.post(url, payload, { headers, timeout: 15000 });
  return data;
}
