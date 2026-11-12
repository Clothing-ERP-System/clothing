const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function getCsrfToken() {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(
    /(?:^|; )\s*csrf_token=([^;]+)/
  );
  return match ? decodeURIComponent(match[1]) : '';
}

/**
 * Centralized fetch helper that adds CSRF token to state-changing requests.
 * Use this instead of raw fetch() for all API calls.
 *
 * @param {string} url - API endpoint URL
 * @param {object} options - fetch options (method, headers, body, etc.)
 * @returns {Promise<Response>} - fetch response
 */
export async function apiFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = { ...options.headers };

  // Add CSRF token for state-changing methods
  if (STATE_CHANGING_METHODS.has(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  return fetch(url, { ...options, headers });
}

export default apiFetch;
