// HTTPS supplies the server clock. performance.now() advances the latest
// sample without being affected by later changes to the local wall clock.
export async function readTime(endpoint, { timeoutMs = 4000, signal } = {}) {
  const url = new URL(endpoint)
  const nonce = crypto.randomUUID()
  url.searchParams.set('nonce', nonce)
  const timeout = AbortSignal.timeout(timeoutMs)
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
  const started = performance.now()
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: requestSignal,
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const sample = await response.json()
  const received = performance.now()
  if (sample.schemaVersion !== 1 || sample.source !== 'cloudflare' || sample.nonce !== nonce ||
      !Number.isSafeInteger(sample.unixMs) || sample.unixMs < 0 ||
      !Number.isFinite(new Date(sample.unixMs).getTime()) ||
      typeof sample.utc !== 'string' || Date.parse(sample.utc) !== sample.unixMs ||
      typeof sample.requestId !== 'string' || sample.requestId.length === 0) {
    throw new Error('时间接口返回了无效数据')
  }
  const roundTripMs = received - started
  return {
    sample,
    roundTripMs,
    // Half the round trip is an estimate, not a bound on clock error.
    baseUnixMs: sample.unixMs + roundTripMs / 2,
    received,
  }
}

export function localTime(reason) {
  const unixMs = Date.now()
  return {
    sample: { utc: new Date(unixMs).toISOString(), unixMs, source: 'local', reason },
    roundTripMs: null,
    baseUnixMs: unixMs,
    received: performance.now(),
  }
}

export function currentUnixMs(clock, now = performance.now()) {
  return clock.baseUnixMs + Math.max(0, now - clock.received)
}
