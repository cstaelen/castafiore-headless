const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const CONFIG_FILE  = '/config/camilladsp.yml'
const PRESETS_DIR  = '/config/presets'
const STATE_FILE   = '/config/dsp-state.json'

// ── State ──────────────────────────────────────────────────────────────────

const loadState = () => {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) } catch { return { enabled: true, preset: null } }
}
const saveState = (s) => {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(s), 'utf8') } catch {}
}

let state = loadState()

// ── CamillaDSP ─────────────────────────────────────────────────────────────

const reloadCamilla = () => {
  try { execFileSync('pkill', ['-HUP', 'camilladsp'], { stdio: 'ignore' }) } catch {}
}

// ── YAML patch (no full parse — preserves comments and structure) ───────────

const patchGain = (text, band, gain) => {
  const re = new RegExp(`(${band}:[\\s\\S]*?gain:\\s*)(-?\\d+(?:\\.\\d+)?)`)
  if (!re.test(text)) throw new Error(`Band ${band} not found in config`)
  return text.replace(re, `$1${gain}`)
}

// ── Config read/write ──────────────────────────────────────────────────────

const readConfig = () => fs.readFileSync(CONFIG_FILE, 'utf8')
const writeConfig = (text) => fs.writeFileSync(CONFIG_FILE, text, 'utf8')

const getGains = () => {
  const text = readConfig()
  const bands = [...text.matchAll(/^\s+(eq_\w+):/gm)].map(m => m[1])
  const gains = {}
  bands.forEach(band => {
    const m = text.match(new RegExp(`${band}:[\\s\\S]*?gain:\\s*(-?\\d+(?:\\.\\d+)?)`))
    gains[band] = m ? parseFloat(m[1]) : 0
  })
  return { bands, gains }
}

// ── Presets ────────────────────────────────────────────────────────────────

const listPresets = () => {
  try {
    return fs.readdirSync(PRESETS_DIR)
      .filter(f => f.endsWith('.yml'))
      .map(f => path.basename(f, '.yml'))
      .sort()
  } catch { return [] }
}

const loadPreset = (name) => {
  const src = path.join(PRESETS_DIR, name + '.yml')
  if (!fs.existsSync(src)) throw new Error(`Preset not found: ${name}`)
  fs.copyFileSync(src, CONFIG_FILE)
  state.preset = name
  saveState(state)
  reloadCamilla()
}

const savePreset = (name) => {
  fs.mkdirSync(PRESETS_DIR, { recursive: true })
  fs.copyFileSync(CONFIG_FILE, path.join(PRESETS_DIR, name + '.yml'))
}

// ── Band gain ──────────────────────────────────────────────────────────────

const setBandGain = (band, gain) => {
  const clamped = Math.max(-12, Math.min(12, parseFloat(gain)))
  writeConfig(patchGain(readConfig(), band, clamped))
  // keep preset in sync if one is active
  if (state.preset) savePreset(state.preset)
  reloadCamilla()
}

// ── Toggle ─────────────────────────────────────────────────────────────────

const setEnabled = (enabled) => {
  state.enabled = enabled
  saveState(state)
  if (!enabled) {
    let text = readConfig()
    const { bands } = getGains()
    bands.forEach(band => { try { text = patchGain(text, band, 0) } catch {} })
    writeConfig(text)
    if (state.preset) savePreset(state.preset)
  }
  reloadCamilla()
}

// ── HTTP handler ───────────────────────────────────────────────────────────

const readBody = (req) =>
  new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => resolve(body))
  })

const handle = async (req, res, endpoint) => {
  const ok = (data) => { res.writeHead(200); res.end(JSON.stringify(data ?? { ok: true })) }

  switch (`${req.method} ${endpoint}`) {
    case 'GET /eq': {
      const { bands, gains } = getGains()
      ok({ bands, gains, presets: listPresets(), activePreset: state.preset, enabled: state.enabled })
      break
    }
    case 'POST /eq': {
      const { band, gain } = JSON.parse(await readBody(req))
      setBandGain(band, gain)
      const { bands, gains } = getGains()
      ok({ bands, gains, enabled: state.enabled })
      break
    }
    case 'POST /preset/load': {
      const { preset } = JSON.parse(await readBody(req))
      loadPreset(preset)
      const { bands, gains } = getGains()
      ok({ bands, gains, activePreset: state.preset, enabled: state.enabled })
      break
    }
    case 'POST /preset/save': {
      const { preset } = JSON.parse(await readBody(req))
      savePreset(preset)
      ok({ presets: listPresets(), activePreset: preset })
      break
    }
    case 'POST /toggle': {
      const { enabled } = JSON.parse(await readBody(req))
      setEnabled(!!enabled)
      const { bands, gains } = getGains()
      ok({ bands, gains, enabled: state.enabled })
      break
    }
    default:
      return false
  }
  return true
}

module.exports = { handle }
