const http = require('http')
const net = require('net')
const fs = require('fs')
const path = require('path')

const MPD_HOST = '127.0.0.1'
const MPD_PORT = 6600
const SERVER_PORT = process.env.PORT || 8899
const DIST_DIR = '/app/dist'

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

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

const readFile = (filePath) =>
  new Promise((resolve, reject) => fs.readFile(filePath, (err, data) => (err ? reject(err) : resolve(data))))

const serveStatic = async (req, res) => {
  let filePath = path.join(DIST_DIR, req.url === '/' ? '/index.html' : req.url)
  if (!path.extname(filePath)) filePath = path.join(DIST_DIR, 'index.html')

  try {
    const data = await readFile(filePath)
    res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' })
    res.end(data)
  } catch {
    try {
      const data = await readFile(path.join(DIST_DIR, 'index.html'))
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(data)
    } catch {
      res.writeHead(404)
      res.end('Not found')
    }
  }
}

const readBody = (req) =>
  new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => resolve(body))
  })

const apiHandler = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')

  const endpoint = new URL(req.url, 'http://localhost').pathname.replace('/api', '')
  const ok = () => { res.writeHead(200); res.end(JSON.stringify({ ok: true })) }

  try {
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
        res.writeHead(404)
        res.end(JSON.stringify({ error: 'Not found' }))
    }
  } catch (err) {
    console.error('API error:', err.message)
    res.writeHead(500)
    res.end(JSON.stringify({ error: err.message }))
  }
}

http
  .createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.writeHead(204)
      res.end()
      return
    }
    if (req.url.startsWith('/api/')) apiHandler(req, res)
    else serveStatic(req, res)
  })
  .listen(SERVER_PORT, () => {
    console.log(`Castafiore headless server on port ${SERVER_PORT}`)
  })
