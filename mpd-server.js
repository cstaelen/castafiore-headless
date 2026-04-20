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

const mpdCommand = (commands) => new Promise((resolve, reject) => {
	const socket = new net.Socket()
	const queue = Array.isArray(commands) ? [...commands] : [commands]
	let buffer = ''
	let results = []

	const sendNext = () => {
		if (queue.length === 0) {
			socket.destroy()
			resolve(results.join(''))
			return
		}
		const cmd = queue.shift()
		buffer = ''
		socket.write(cmd + '\n')
	}

	socket.connect(MPD_PORT, MPD_HOST)

	socket.on('data', (data) => {
		buffer += data.toString()

		// Wait for greeting
		if (buffer.startsWith('OK MPD')) {
			buffer = ''
			sendNext()
			return
		}

		// Wait for complete response
		if (buffer.endsWith('OK\n')) {
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

const parseStatus = (raw) => {
	const result = {}
	for (const line of raw.split('\n')) {
		const idx = line.indexOf(': ')
		if (idx > -1) result[line.slice(0, idx)] = line.slice(idx + 2)
	}
	return result
}

const serveStatic = (req, res) => {
	let filePath = path.join(DIST_DIR, req.url === '/' ? '/index.html' : req.url)

	// SPA fallback
	if (!path.extname(filePath)) filePath = path.join(DIST_DIR, 'index.html')

	fs.readFile(filePath, (err, data) => {
		if (err) {
			// SPA fallback for any 404
			fs.readFile(path.join(DIST_DIR, 'index.html'), (err2, data2) => {
				if (err2) { res.writeHead(404); res.end('Not found'); return }
				res.writeHead(200, { 'Content-Type': 'text/html' })
				res.end(data2)
			})
			return
		}
		const ext = path.extname(filePath)
		res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' })
		res.end(data)
	})
}

const apiHandler = async (req, res) => {
	res.setHeader('Access-Control-Allow-Origin', '*')
	res.setHeader('Content-Type', 'application/json')

	const url = new URL(req.url, `http://localhost`)
	const endpoint = url.pathname.replace('/api', '')

	try {
		if (req.method === 'POST' && endpoint === '/load') {
			const body = await readBody(req)
			const { urls, index = 0, queue = [] } = JSON.parse(body)
			currentQueue = queue
			const cmds = ['clear', ...urls.map(u => u.startsWith('http') ? `add "${u}"` : `addid "${u}"`), `play ${index}`]
			await mpdCommand(cmds)
			res.writeHead(200); res.end(JSON.stringify({ ok: true }))

		} else if (req.method === 'POST' && endpoint === '/play') {
			await mpdCommand('play')
			res.writeHead(200); res.end(JSON.stringify({ ok: true }))

		} else if (req.method === 'POST' && endpoint === '/pause') {
			await mpdCommand('pause 1')
			res.writeHead(200); res.end(JSON.stringify({ ok: true }))

		} else if (req.method === 'POST' && endpoint === '/resume') {
			await mpdCommand('pause 0')
			res.writeHead(200); res.end(JSON.stringify({ ok: true }))

		} else if (req.method === 'POST' && endpoint === '/stop') {
			await mpdCommand('stop')
			res.writeHead(200); res.end(JSON.stringify({ ok: true }))

		} else if (req.method === 'POST' && endpoint === '/seek') {
			const body = await readBody(req)
			const { position } = JSON.parse(body)
			await mpdCommand(`seekcur ${Math.floor(position)}`)
			res.writeHead(200); res.end(JSON.stringify({ ok: true }))

		} else if (req.method === 'POST' && endpoint === '/volume') {
			const body = await readBody(req)
			const { volume } = JSON.parse(body)
			await mpdCommand(`setvol ${Math.round(volume * 100)}`)
			res.writeHead(200); res.end(JSON.stringify({ ok: true }))

		} else if (req.method === 'GET' && endpoint === '/status') {
			const raw = await mpdCommand('status')
			const status = parseStatus(raw)
			const elapsed = parseFloat(status.elapsed || 0)
			const duration = parseFloat(status.duration || 0)
			const songPos = parseInt(status.song ?? -1)
			const track = songPos >= 0 ? currentQueue[songPos] ?? null : null
			res.writeHead(200); res.end(JSON.stringify({ state: status.state, elapsed, duration, volume: parseInt(status.volume || 100), songPos, track }))

		} else {
			res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' }))
		}
	} catch (err) {
		console.error('API error:', err.message)
		res.writeHead(500); res.end(JSON.stringify({ error: err.message }))
	}
}

const readBody = (req) => new Promise((resolve) => {
	let body = ''
	req.on('data', chunk => body += chunk)
	req.on('end', () => resolve(body))
})

http.createServer((req, res) => {
	if (req.method === 'OPTIONS') {
		res.setHeader('Access-Control-Allow-Origin', '*')
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
		res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
		res.writeHead(204); res.end()
		return
	}

	if (req.url.startsWith('/api/')) {
		apiHandler(req, res)
	} else {
		serveStatic(req, res)
	}
}).listen(SERVER_PORT, () => {
	console.log(`Castafiore headless server on port ${SERVER_PORT}`)
})
