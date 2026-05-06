const http = require('http')
const fs = require('fs')
const path = require('path')
const mpd = require('./api-mpd')
const dsp = require('./api-dsp')

const SERVER_PORT = process.env.PORT || 8899
const DIST_DIR = '/app/dist'
const PUBLIC_DIR = '/app/public'
const PUBLIC_FILES = new Set(fs.readdirSync(PUBLIC_DIR).filter(f => f !== 'eq.html'))

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

const apiHandler = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')

  const pathname = new URL(req.url, 'http://localhost').pathname

  try {
    if (pathname.startsWith('/api/dsp')) {
      const endpoint = pathname.replace('/api/dsp', '')
      const handled = await dsp.handle(req, res, endpoint)
      if (!handled) { res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' })) }
      return
    }

    const endpoint = pathname.replace('/api', '')
    const handled = await mpd.handle(req, res, endpoint)
    if (!handled) { res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' })) }
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
    else if (req.url === '/eq') {
      readFile(path.join(PUBLIC_DIR, 'eq.html'))
        .then(data => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(data) })
        .catch(() => { res.writeHead(404); res.end('Not found') })
    }
    else if (PUBLIC_FILES.has(req.url.slice(1))) {
      const filePath = path.join(PUBLIC_DIR, req.url.slice(1))
      readFile(filePath)
        .then(data => { res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' }); res.end(data) })
        .catch(() => { res.writeHead(404); res.end('Not found') })
    }
    else serveStatic(req, res)
  })
  .listen(SERVER_PORT, () => {
    console.log('')
    console.log('  ╔═══════════════════════════════════════════════════╗')
    console.log('  ║ CASTAFIORE  HEADLESS - \x1b[32mrunning\x1b[0m                    ║')
    console.log('  ╠═══════════════════════════════════════════════════╣')
    console.log('  ║ Doc: httpsgithub.com/cstaelen/castafiore-headless ║')
    console.log('  ╠═══════════════════════════════════════════════════╣')
    console.log(`  ║ http://localhost:${SERVER_PORT}  →  Castafiore              ║`)
    console.log(`  ║ http://localhost:${SERVER_PORT}/eq  →  Equalizer            ║`)
    console.log('  ╚═══════════════════════════════════════════════════╝')
    console.log('')
  })
