export const state = { user: null, csrf: null, notice: '', offline: false, generationProbe: null };

export async function api(path, options = {}) {
  const method = options.method || 'GET';
  const headers = {};
  if (state.user && path !== 'status') headers['X-Titan-Account'] = state.user.id;
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    if (state.csrf) headers['X-CSRF-Token'] = state.csrf;
  }
  const response = await fetch('./api/' + path, { method, headers, credentials: 'same-origin',
    cache: 'no-store', body: method === 'GET' ? undefined : JSON.stringify(options.data || {}),
    signal: options.signal || AbortSignal.timeout(16000) });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw Object.assign(new Error(error.error || 'O servidor não está disponível.'), { status: response.status, code: error.code });
  }
  return options.stream ? response : response.json();
}
export const get = api;
export const write = (path, method, data) => api(path, { method, data });
export const navigate = (screen, id = '') => {
  const route = screen + (id ? '/' + encodeURIComponent(id) : '');
  if (location.hash !== '#' + route) location.hash = route;
  else window.dispatchEvent(new HashChangeEvent('hashchange'));
};
