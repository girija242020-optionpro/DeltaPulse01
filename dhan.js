const { authenticator } = require('otplib');
const BASE = 'https://api.dhan.co/v2';
const AUTH = 'https://auth.dhan.co/app/generateAccessToken';
let token = null, expiryAt = 0, authAt = 0, lastAuthError = null, authPromise = null;
function required(name) { if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`); return process.env[name]; }
function getAuthState() { return { configured: Boolean(process.env.DHAN_CLIENT_ID && process.env.DHAN_PIN && process.env.DHAN_TOTP_SECRET), authenticated: Boolean(token && Date.now() < expiryAt), expiryTime: expiryAt ? new Date(expiryAt).toISOString() : null, lastAuthAt: authAt ? new Date(authAt).toISOString() : null, lastAuthError }; }
async function generateToken(force = false) {
  const buffer = Number(process.env.TOKEN_REFRESH_BEFORE_EXPIRY_MINUTES || 10) * 60000;
  if (!force && token && Date.now() < expiryAt - buffer) return token;
  if (authPromise) return authPromise;
  authPromise = (async () => {
    const clientId = required('DHAN_CLIENT_ID'), pin = required('DHAN_PIN'), secret = required('DHAN_TOTP_SECRET').replace(/\s+/g, '');
    authenticator.options = { step: 30, window: 1 };
    const url = new URL(AUTH); url.searchParams.set('dhanClientId', clientId); url.searchParams.set('pin', pin); url.searchParams.set('totp', authenticator.generate(secret));
    const response = await fetch(url, { method: 'POST', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.accessToken) { lastAuthError = `Dhan token generation failed (${response.status}): ${JSON.stringify(body).slice(0, 350)}`; throw new Error(lastAuthError); }
    token = body.accessToken; expiryAt = body.expiryTime ? new Date(body.expiryTime).getTime() : Date.now() + 86400000; authAt = Date.now(); lastAuthError = null; return token;
  })().finally(() => { authPromise = null; });
  return authPromise;
}
async function dhanFetch(path, options = {}) {
  const accessToken = await generateToken();
  const response = await fetch(`${BASE}${path}`, { method: options.method || 'GET', headers: { 'access-token': accessToken, 'Content-Type': 'application/json', accept: 'application/json', ...(options.headers || {}) }, body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: AbortSignal.timeout(options.timeout || 20000) });
  const text = await response.text(); let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 1000) }; }
  if (response.status === 401 && !options._retried) { token = null; expiryAt = 0; await generateToken(true); return dhanFetch(path, { ...options, _retried: true }); }
  if (!response.ok) { const error = new Error(`Dhan API ${response.status}: ${JSON.stringify(data).slice(0, 450)}`); error.status = response.status; throw error; }
  return data;
}
module.exports = { generateToken, dhanFetch, getAuthState };
