import assert from 'node:assert/strict'
import { test } from 'node:test'
import { currentUnixMs, localTime, readTime } from '../public/clock.js'

const unixMs = Date.parse('2026-11-10T08:30:00.123Z')
const sampleFor = url => ({
  schemaVersion: 1,
  utc: new Date(unixMs).toISOString(),
  unixMs,
  source: 'cloudflare',
  requestId: 'test-request-id',
  nonce: new URL(url).searchParams.get('nonce'),
})

test('client requests a fresh sample and keeps the original server timestamp', async t => {
  const nonces = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.cache, 'no-store')
    assert.equal(options.headers.Accept, 'application/json')
    assert.ok(options.signal instanceof AbortSignal)
    assert.equal(new URL(url).searchParams.get('existing'), 'value')
    const sample = sampleFor(url)
    nonces.push(sample.nonce)
    return Response.json(sample)
  })

  const clock = await readTime('https://caf-netapi.example/api/time?existing=value&nonce=old')
  await readTime('https://caf-netapi.example/api/time?existing=value')
  assert.notEqual(nonces[0], 'old')
  assert.notEqual(nonces[0], nonces[1])
  assert.equal(clock.sample.unixMs, unixMs)
  assert.equal(clock.baseUnixMs, unixMs + clock.roundTripMs / 2)
  assert.equal(currentUnixMs(clock, clock.received + 2000), clock.baseUnixMs + 2000)
})

test('client rejects stale, inconsistent and out-of-range samples', async t => {
  const mutations = [
    { nonce: 'old-request' },
    { source: 'local' },
    { schemaVersion: 2 },
    { unixMs: '1794299400123' },
    { unixMs: -1 },
    { unixMs: Number.MAX_SAFE_INTEGER },
    { utc: 'invalid' },
    { utc: '2026-11-10T08:30:01.123Z' },
    { requestId: '' },
  ]
  for (const mutation of mutations) {
    const mock = t.mock.method(globalThis, 'fetch', async url => Response.json({ ...sampleFor(url), ...mutation }))
    await assert.rejects(readTime('https://caf-netapi.example/api/time'), /无效数据/)
    mock.mock.restore()
  }
})

test('HTTP errors, broken JSON and network failures propagate to the fallback caller', async t => {
  const cases = [
    [() => new Response('unavailable', { status: 503 }), /HTTP 503/],
    [() => new Response('<html>not an API</html>'), SyntaxError],
    [() => { throw new TypeError('Network unavailable') }, /Network unavailable/],
  ]
  for (const [response, expected] of cases) {
    const mock = t.mock.method(globalThis, 'fetch', async () => response())
    await assert.rejects(readTime('https://caf-netapi.example/api/time'), expected)
    mock.mock.restore()
  }
})

test('network timeout aborts the pending request', async t => {
  // Keep the event loop alive while the unrefed AbortSignal timer fires.
  const keepAlive = setTimeout(() => {}, 1000)
  t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))
  try {
    await assert.rejects(readTime('https://caf-netapi.example/api/time', { timeoutMs: 10 }), { name: 'TimeoutError' })
  } finally {
    clearTimeout(keepAlive)
  }
})

test('caller cancellation is passed to fetch', async t => {
  const controller = new AbortController()
  controller.abort()
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => {
    signal.throwIfAborted()
  })
  await assert.rejects(readTime('https://caf-netapi.example/api/time', { signal: controller.signal }), { name: 'AbortError' })
})

test('local fallback identifies its source and advances independently of wall-clock changes', t => {
  const before = Date.now()
  const clock = localTime('取时超时')
  const after = Date.now()
  assert.equal(clock.sample.source, 'local')
  assert.equal(clock.sample.reason, '取时超时')
  assert.equal(clock.roundTripMs, null)
  assert.ok(clock.sample.unixMs >= before && clock.sample.unixMs <= after)
  assert.equal(Date.parse(clock.sample.utc), clock.sample.unixMs)
  t.mock.method(Date, 'now', () => 0)
  assert.equal(currentUnixMs(clock, clock.received + 5000), clock.sample.unixMs + 5000)
})
