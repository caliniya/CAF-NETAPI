// Cloudflare Pages advanced mode: only /api/* reaches this Worker.
// Add future APIs to this route table; static files remain in public/.
const routes = new Map([
  ['/api/time', timeResponse],
])

function apiResponse(body, status = 200, extraHeaders = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'CDN-Cache-Control': 'no-store',
      'Cloudflare-CDN-Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Accept, Content-Type',
      'Access-Control-Expose-Headers': 'X-Request-ID',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  })
}

function timeResponse(request, url) {
  if (request.method === 'OPTIONS') {
    return apiResponse(null, 204)
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return apiResponse({ error: { code: 'method_not_allowed', message: 'Use GET or HEAD.' } }, 405, {
      Allow: 'GET, HEAD, OPTIONS',
    })
  }

  const nonce = url.searchParams.get('nonce')
  if (nonce !== null && !/^[A-Za-z0-9_-]{1,128}$/.test(nonce)) {
    return apiResponse(request.method === 'HEAD' ? null : {
      error: { code: 'invalid_nonce', message: 'nonce must contain 1–128 ASCII letters, digits, underscores or hyphens.' },
    }, 400)
  }

  const requestId = crypto.randomUUID()
  // Both representations come from the same server clock sample.
  const unixMs = Date.now()
  const sample = {
    schemaVersion: 1,
    utc: new Date(unixMs).toISOString(),
    unixMs,
    source: 'cloudflare',
    requestId,
    nonce,
  }
  return apiResponse(request.method === 'HEAD' ? null : sample, 200, { 'X-Request-ID': requestId })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname.replace(/\/$/, '')
    const handler = routes.get(path)
    if (handler) return handler(request, url)

    if (path === '/api' || path.startsWith('/api/')) {
      return apiResponse(request.method === 'HEAD' ? null : {
        error: { code: 'not_found', message: 'API endpoint not found.' },
      }, 404)
    }
    return env.ASSETS.fetch(request)
  },
}
