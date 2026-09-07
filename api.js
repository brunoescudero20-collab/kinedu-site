// Thin client for the KinEdu backend (backend/). Loaded before script.js.
// Every call here is meant to be additive: if the backend is unreachable,
// callers catch the rejection and fall back to the static content that was
// already in index.html, so the page never breaks because of this file.
//
// Base URL: defaults to a same-origin relative "/api", which is correct
// whenever the backend serves the frontend itself (production — see
// docs/deployment.md — and also `node backend/src/server.js` alone on
// :3001 in local dev). The one case that needs an absolute override is
// this repo's split local-dev setup (python -m http.server 8080 for the
// frontend + the backend separately on :3001, two different origins) —
// detected here by the known dev port rather than hardcoded permanently,
// so the same file is correct in both places without manual editing.
const KINEDU_API_BASE = window.KINEDU_API_BASE
  || (location.port === '8080' ? 'http://localhost:3001/api' : '/api');

async function apiFetch(path, opts) {
  opts = opts || {};
  // A shallow Object.assign on `opts` alone would let a caller-supplied
  // `headers` object silently replace (not merge with) Content-Type —
  // merge the headers explicitly instead.
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  const res = await fetch(KINEDU_API_BASE + path, Object.assign({}, opts, { headers: headers }));
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    const err = new Error((data && data.message) || 'Erro na requisição.');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ── session (login token) ────────────────────────────────────────────
// Persisted client-side purely for UI convenience (show/hide the admin
// link, avoid an extra round-trip). It is never the real security
// boundary — every /api/admin/* call is re-checked server-side against the
// signed token regardless of what this object says.
const KINEDU_SESSION_KEY = 'kinedu_session_v1';
const KinEduSession = {
  get() {
    try { return JSON.parse(localStorage.getItem(KINEDU_SESSION_KEY) || 'null'); } catch (e) { return null; }
  },
  set(session) {
    try { localStorage.setItem(KINEDU_SESSION_KEY, JSON.stringify(session)); } catch (e) { /* ignore */ }
  },
  clear() {
    try { localStorage.removeItem(KINEDU_SESSION_KEY); } catch (e) { /* ignore */ }
  },
  isAdmin() {
    const s = KinEduSession.get();
    return !!(s && s.is_admin && s.token);
  },
};
window.KinEduSession = KinEduSession;

function adminFetch(path, opts) {
  opts = opts || {};
  const session = KinEduSession.get();
  const headers = Object.assign({}, opts.headers || {}, session && session.token ? { Authorization: 'Bearer ' + session.token } : {});
  return apiFetch(path, Object.assign({}, opts, { headers: headers }));
}

const KinEduAPI = {
  getCategories() { return apiFetch('/categories'); },
  getCategoryArticles(slug) { return apiFetch('/categories/' + encodeURIComponent(slug) + '/articles'); },
  getArticle(idOrSlug) { return apiFetch('/articles/' + encodeURIComponent(idOrSlug)); },
  search(q) { return apiFetch('/search?q=' + encodeURIComponent(q)); },
  getStats() { return apiFetch('/stats'); },
  // Fire-and-forget analytics: never awaited by callers before rendering,
  // and any failure here is swallowed so it can never block the user.
  logSearch(query) {
    return apiFetch('/analytics/search', { method: 'POST', body: JSON.stringify({ query }) }).catch(function () {});
  },
  logArticleView(articleId) {
    return apiFetch('/analytics/article-view', { method: 'POST', body: JSON.stringify({ articleId: articleId }) }).catch(function () {});
  },
  signup(email, password) { return apiFetch('/auth/signup', { method: 'POST', body: JSON.stringify({ email: email, password: password }) }); },
  login(email, password) {
    return apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email: email, password: password }) })
      .then(function (result) { KinEduSession.set(result); return result; });
  },
  logout() { KinEduSession.clear(); },
};

// Admin review panel (/api/admin/*) — separate object, separate auth
// (session token from login, checked server-side against is_admin), kept
// apart from KinEduAPI so it's obvious at a glance which calls need an
// admin session and which are public.
const KinEduAdminAPI = {
  me() { return adminFetch('/admin/me'); },
  listCandidates(filters) {
    const qs = new URLSearchParams();
    Object.keys(filters || {}).forEach(function (k) { if (filters[k]) qs.set(k, filters[k]); });
    const q = qs.toString();
    return adminFetch('/admin/candidates' + (q ? '?' + q : ''));
  },
  getCandidate(id) { return adminFetch('/admin/candidates/' + encodeURIComponent(id)); },
  approve(id) { return adminFetch('/admin/candidates/' + encodeURIComponent(id) + '/approve', { method: 'POST' }); },
  reject(id, reason) { return adminFetch('/admin/candidates/' + encodeURIComponent(id) + '/reject', { method: 'POST', body: JSON.stringify({ reason: reason }) }); },
};

// `const` at script top-level does not become a `window` property (unlike
// `var`) — script.js checks `window.KinEduAPI` to decide whether the API is
// available, so it must be attached explicitly.
window.KinEduAPI = KinEduAPI;
window.KinEduAdminAPI = KinEduAdminAPI;
