import assert from 'node:assert/strict'
import { test } from 'node:test'
import worker from '../public/_worker.js'

const request = (path, options) => new Request(`https://caf-netapi.example${path}`, options)
const assertNoCache = response => {
  for (const header of ['Cache-Control', 'CDN-Cache-Control', 'Cloudflare-CDN-Cache-Control']) {
    assert.equal(response.headers.get(header), 'no-store')
  }
}

test('time sample uses the server clock and echoes the request nonce', async () => {
  const before = Date.now()
  const response = await worker.fetch(request('/api/time?nonce=memory_123-abc'), {})
  const sample = await response.json()
  const after = Date.now()

  assert.equal(response.status, 200)
  assert.match(response.headers.get('Content-Type'), /^application\/json/)
  assertNoCache(response)
  assert.equal(sample.schemaVersion, 1)
  assert.equal(sample.source, 'cloudflare')
  assert.equal(sample.nonce, 'memory_123-abc')
  assert.ok(sample.unixMs >= before && sample.unixMs <= after)
  assert.equal(sample.utc, new Date(sample.unixMs).toISOString())
  assert.match(sample.requestId, /^[0-9a-f-]{36}$/)
  assert.equal(response.headers.get('X-Request-ID'), sample.requestId)
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*')
})

test('each request has a new ID and optional nonce defaults to null', async () => {
  const first = await (await worker.fetch(request('/api/time'), {})).json()
  const second = await (await worker.fetch(request('/api/time/'), {})).json()
  assert.equal(first.nonce, null)
  assert.notEqual(first.requestId, second.requestId)
})

test('invalid nonce is rejected without cacheable errors', async () => {
  for (const nonce of ['', 'a'.repeat(129), 'bad value', '<script>', '中文']) {
    const response = await worker.fetch(request(`/api/time?nonce=${encodeURIComponent(nonce)}`), {})
    assert.equal(response.status, 400)
    assert.equal((await response.json()).error.code, 'invalid_nonce')
    assertNoCache(response)
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*')
  }
  const response = await worker.fetch(request(`/api/time?nonce=${'a'.repeat(128)}`), {})
  assert.equal(response.status, 200)
})

test('HEAD returns headers only and OPTIONS permits cross-origin reads', async () => {
  const head = await worker.fetch(request('/api/time?nonce=head', { method: 'HEAD' }), {})
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
  assert.ok(head.headers.get('X-Request-ID'))
  assertNoCache(head)

  const invalidHead = await worker.fetch(request('/api/time?nonce=', { method: 'HEAD' }), {})
  assert.equal(invalidHead.status, 400)
  assert.equal(await invalidHead.text(), '')

  const options = await worker.fetch(request('/api/time', { method: 'OPTIONS' }), {})
  assert.equal(options.status, 204)
  assert.equal(await options.text(), '')
  assert.equal(options.headers.get('Access-Control-Allow-Methods'), 'GET, HEAD, OPTIONS')
})

test('unsupported methods and unknown APIs return JSON errors', async () => {
  const post = await worker.fetch(request('/api/time', { method: 'POST' }), {})
  assert.equal(post.status, 405)
  assert.equal(post.headers.get('Allow'), 'GET, HEAD, OPTIONS')
  assert.equal((await post.json()).error.code, 'method_not_allowed')
  assertNoCache(post)

  for (const path of ['/api', '/api/', '/api/missing', '/api/time/extra']) {
    const response = await worker.fetch(request(path), {})
    assert.equal(response.status, 404)
    assert.equal((await response.json()).error.code, 'not_found')
    assertNoCache(response)
  }
})

test('static requests delegate to the Pages assets binding', async () => {
  const original = request('/styles.css')
  const response = await worker.fetch(original, {
    ASSETS: { fetch: received => {
      assert.equal(received, original)
      return new Response('body { color: green; }', { headers: { 'Content-Type': 'text/css' } })
    } },
  })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Content-Type'), 'text/css')
})
