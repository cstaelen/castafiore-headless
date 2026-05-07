<div align="center">

# Castafiore Headless

<img src="https://sawyerf.github.io/Castafiore/assets/assets/icon.5fe6ff6eff544d09eebc5dae63540fac.png" height="80" alt="Castafiore" align="middle" />&nbsp;&nbsp;
<img src="https://github.com/cstaelen/castafiore-headless/blob/main/.github/assets/plus.png?raw=true" height="16" alt="+" align="middle" />&nbsp;&nbsp;
<img src="https://github.com/cstaelen/castafiore-headless/blob/main/.github/assets/docker.png?raw=true" height="80" alt="Docker" align="middle" />&nbsp;&nbsp;
<img src="https://github.com/cstaelen/castafiore-headless/blob/main/.github/assets/plus.png?raw=true" height="16" alt="+" align="middle" />&nbsp;&nbsp;
<img src="https://github.com/cstaelen/castafiore-headless/blob/main/.github/assets/raspberry-pi.png?raw=true" height="80" alt="Raspberry Pi" align="middle" />&nbsp;&nbsp;
<img src="https://github.com/cstaelen/castafiore-headless/blob/main/.github/assets/plus.png?raw=true" height="16" alt="+" align="middle" />&nbsp;&nbsp;
<img src="https://github.com/cstaelen/castafiore-headless/blob/main/.github/assets/speaker.png?raw=true" height="80" alt="Speaker" align="middle" />

![Docker build](https://img.shields.io/github/actions/workflow/status/cstaelen/castafiore-headless/docker-push.yml?label=Docker%20build&labelColor=555555&logoColor=ffffff&style=for-the-badge&logo=github)
[![Docker Pulls](https://img.shields.io/docker/pulls/cstaelen/castafiore-headless.svg?color=1d64ed&labelColor=1d8fed&logoColor=ffffff&style=for-the-badge&label=pulls&logo=docker)](https://hub.docker.com/r/cstaelen/castafiore-headless)
![Docker image size](https://img.shields.io/docker/image-size/cstaelen/castafiore-headless?style=for-the-badge)

A Docker image that runs [Castafiore](https://github.com/sawyerf/Castafiore) as a self-hosted web app designed for Raspberry Pi and headless servers with hardware audio output.

</div>

## Features

- Self-hosted web UI for controlling your Navidrome music library
- Control playback from any phone, tablet using the browser
- Stream music directly to your Raspberry Pi speakers
- Flexible audio output: local (browser) or remote (Raspberry Pi via MPD)
- Equalizer powered by CamillaDSP using dedicated web UI

⚠️ **WORK IN PROGRESS**

## Requirements

- Docker with `linux/arm64` or `linux/amd64` support
- ALSA-compatible audio device

## Usage

### docker-compose (recommended)

```yaml
services:
  castafiore-headless:
    image: cstaelen/castafiore-headless:latest
    devices:
      - /dev/snd
    ports:
      - "8899:8899"
    environment:
      ALSA_DEVICE: plughw:0,0 # run `aplay -l` to list available devices
    restart: unless-stopped
```

### docker run

```sh
docker run --rm -p 8899:8899 \
  --device /dev/snd \
  -e ALSA_DEVICE="plughw:0,0" \
  cstaelen/castafiore-headless:latest
```

Then open `http://<host>:8899` in your browser and connect to your Navidrome/Subsonic server.

Castafiore UI lets you switch between two output modes:

- **Remote:** audio routed through MPD (default in headless mode)
- **Local:** audio played directly in the browser via HTML audio

## Equalizer (optional)

A 10-band parametric EQ powered by [CamillaDSP](https://github.com/HEnquist/camilladsp) is available at `http://<host>:8899/eq`.

To enable it, mount a local `config/` directory:

```yaml
volumes:
  - ./config:/config   # optional — required to use the EQ
```

On first start, default presets (flat, bass, treble, rock...) are copied to `config/presets/`. The active config is always `config/camilladsp.yml`.

**Directory layout:**

```
config/
├── camilladsp.yml      # active config (written by the EQ UI)
├── dsp-state.json      # enabled/disabled state (auto-managed)
└── presets/
    ├── flat.yml
    ├── bass.yml
    └── custom.yml      # add your own YML files here
```

Selecting a preset in the UI copies it to `camilladsp.yml`. Adjusting a slider writes directly to `camilladsp.yml` and keeps the active preset file in sync.

The `ALSA_DEVICE` environment variable is automatically injected into all preset files on first start. Run `aplay -l` inside the container to list available devices.

## Environment variables

| Variable      | Default      | Description                  |
| ------------- | ------------ | ---------------------------- |
| `PORT`        | `8899`       | HTTP port for the web server |
| `ALSA_DEVICE` | `plughw:0,0` | ALSA output device (used by default CamillaDSP config) |

## List available audio devices

```sh
docker run --rm --device /dev/snd cstaelen/castafiore-headless:latest aplay -l
```

## Architecture

- **Node.js server** serves the Castafiore web app (static files) and a REST API on a single port (8899)
- **MPD** handles audio playback via ALSA, internal to the container (port 6600 is never exposed)
- The browser controls MPD through `/api/*` endpoints served by the same Node.js server

## Build

```sh
# Local build
make build

# Multi-arch push (amd64 + arm64)
make push

# arm64 only (Raspberry Pi)
make push-rpi
```
