// Thin client for the KinEdu backend (backend/). Loaded before script.js.
// Every call here is meant to be additive: if the backend is unreachable,
// callers catch the rejection and fall back to the static content that was
// already in index.html, so the page never breaks because of this file.
const KINEDU_API_BASE = window.KINEDU_API_BASE || 'http://localhost:3001/api';

async function apiFetch(path, opts) {
  const res = await fetch(KINEDU_API_BASE + path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts));
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
  login(email, password) { return apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email: email, password: password }) }); },
};

// `const` at script top-level does not become a `window` property (unlike
// `var`) — script.js checks `window.KinEduAPI` to decide whether the API is
// available, so it must be attached explicitly.
window.KinEduAPI = KinEduAPI;
