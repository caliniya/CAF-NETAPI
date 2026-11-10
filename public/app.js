import { currentUnixMs, localTime, readTime } from './clock.js'

const elements = Object.fromEntries([
  'clock', 'utc-date', 'local-clock', 'status', 'source', 'latency',
  'synced-at', 'notice', 'payload', 'endpoint', 'refresh', 'copy',
].map(id => [id, document.getElementById(id)]))
const endpoint = new URL('/api/time', location.origin).href
elements.endpoint.href = endpoint
elements.endpoint.textContent = endpoint

const localFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  timeZoneName: 'short',
})
let clock = null
let syncing = false

function renderClock() {
  if (!clock) return
  const date = new Date(currentUnixMs(clock))
  const iso = date.toISOString()
  elements.clock.textContent = iso.slice(11, 19)
  elements.clock.dateTime = iso
  elements['utc-date'].textContent = iso.slice(0, 10).replaceAll('-', ' / ')
  elements['local-clock'].textContent = localFormatter.format(date)
}

async function sync() {
  if (syncing) return
  syncing = true
  elements.refresh.disabled = true
  elements.status.dataset.state = 'loading'
  elements.status.textContent = '正在获取时间'
  try {
    clock = await readTime(endpoint)
    elements.status.dataset.state = 'online'
    elements.status.textContent = '在线取时'
    elements.source.textContent = 'Cloudflare'
    elements.latency.textContent = `${Math.round(clock.roundTripMs)} ms`
    elements.notice.textContent = '已获取服务器时间；页面按最近一次取时推进，每分钟重新同步。'
  } catch (error) {
    const reason = error.name === 'TimeoutError' ? '取时超时' : (error.message || '无法连接时间接口')
    clock = localTime(reason)
    elements.status.dataset.state = 'local'
    elements.status.textContent = '本机时间 · 回退'
    elements.source.textContent = '本机（未校验）'
    elements.latency.textContent = '—'
    elements.notice.textContent = `${reason}。当前使用本机时间，恢复连接后会重新尝试在线取时。`
  } finally {
    elements['synced-at'].textContent = clock.sample.utc.slice(11, 19)
    elements.payload.textContent = JSON.stringify(clock.sample, null, 2)
    renderClock()
    elements.refresh.disabled = false
    syncing = false
  }
}

elements.refresh.addEventListener('click', sync)
elements.copy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(endpoint)
    elements.copy.textContent = '已复制'
  } catch {
    const range = document.createRange()
    range.selectNodeContents(elements.endpoint)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    elements.copy.textContent = '请复制选中地址'
  }
  setTimeout(() => { elements.copy.textContent = '复制地址' }, 2000)
})
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && clock && performance.now() - clock.received >= 60000) sync()
})
window.addEventListener('online', sync)
setInterval(() => { if (document.visibilityState === 'visible') renderClock() }, 250)
setInterval(() => { if (document.visibilityState === 'visible') sync() }, 60000)
sync()
