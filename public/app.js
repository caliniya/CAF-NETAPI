import { currentUnixMs, localTime, readTime } from './clock.js'

const elements = Object.fromEntries([
  'clock', 'utc-date', 'local-clock', 'status', 'endpoint', 'refresh', 'copy',
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
  elements.status.textContent = '正在同步'
  try {
    clock = await readTime(endpoint)
    elements.status.dataset.state = 'online'
    elements.status.textContent = 'Cloudflare'
  } catch {
    clock = localTime('在线取时失败')
    elements.status.dataset.state = 'local'
    elements.status.textContent = '连接失败 · 使用本机时间'
  } finally {
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
