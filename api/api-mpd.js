const net = require('net')

const MPD_HOST = '127.0.0.1'
const MPD_PORT = 6600

let currentQueue = []

const mpdCommand = (commands) =>
  new Promise((resolve, reject) => {
    const socket = new net.Socket()
    const queue = Array.isArray(commands) ? [...commands] : [commands]
    let buffer = ''
    const results = []

    const sendNext = () => {
      if (queue.length === 0) {
        socket.destroy()
        resolve(results.join(''))
        return
      }
      buffer = ''
      socket.write(queue.shift() + '\n')
    }

    socket.connect(MPD_PORT, MPD_HOST)

    socket.on('data', (data) => {
      buffer += data.toString()
      if (buffer.startsWith('OK MPD')) {
        buffer = ''
        sendNext()
      } else if (buffer.endsWith('OK\n')) {
        results.push(buffer)
        sendNext()
      } else if (buffer.match(/^ACK /m)) {
        socket.destroy()
        reject(new Error(buffer.trim()))
      }
    })

    socket.on('error', reject)
    socket.setTimeout(5000, () => {
      socket.destroy()
      reject(new Error('MPD timeout'))
    })
  })

const parseStatus = (raw) =>
  Object.fromEntries(
    raw
      .split('\n')
      .filter((line) => line.includes(': '))
      .map((line) => line.split(': ', 2)),
  )

const readBody = (req) =>
  new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => resolve(body))
  })

const handle = async (req, res, endpoint) => {
  const ok = () => { res.writeHead(200); res.end(JSON.stringify({ ok: true })) }

  switch (`${req.method} ${endpoint}`) {
    case 'POST /load': {
      const { urls, index = 0, queue = [] } = JSON.parse(await readBody(req))
      currentQueue = queue
      console.log('[load] urls:', JSON.stringify(urls))
      await mpdCommand([
        'clear',
        ...urls.map((u) => (u.trim().startsWith('http') ? `add "${u.trim()}"` : `addid "${u}"`)),
        `play ${index}`,
      ])
      ok()
      break
    }
    case 'POST /play':
      await mpdCommand('play'); ok(); break
    case 'POST /pause':
      await mpdCommand('pause 1'); ok(); break
    case 'POST /resume':
      await mpdCommand('pause 0'); ok(); break
    case 'POST /stop':
      await mpdCommand('stop'); ok(); break
    case 'POST /clear':
      await mpdCommand('clear')
      currentQueue = []
      ok()
      break
    case 'POST /seek': {
      const { position } = JSON.parse(await readBody(req))
      await mpdCommand(`seekcur ${Math.floor(position)}`)
      ok()
      break
    }
    case 'POST /volume': {
      const { volume } = JSON.parse(await readBody(req))
      await mpdCommand(`setvol ${Math.round(volume * 100)}`)
      ok()
      break
    }
    case 'GET /status': {
      const status = parseStatus(await mpdCommand('status'))
      const songPos = parseInt(status.song ?? -1)
      res.writeHead(200)
      res.end(JSON.stringify({
        state: status.state,
        elapsed: parseFloat(status.elapsed || 0),
        duration: parseFloat(status.duration || 0),
        volume: parseInt(status.volume || 100),
        songPos,
        track: songPos >= 0 ? (currentQueue[songPos] ?? null) : null,
      }))
      break
    }
    case 'GET /queue':
      res.writeHead(200)
      res.end(JSON.stringify({ queue: currentQueue }))
      break
    default:
      return false
  }
  return true
}

module.exports = { handle }
