<div style="display:flex; align-items: center; gap: 20px">
  <img src="https://sawyerf.github.io/Castafiore/assets/assets/icon.5fe6ff6eff544d09eebc5dae63540fac.png" height="80" alt="Castafiore" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://cdn.simpleicons.org/docker/2496ED" height="80" alt="Docker" />
  &nbsp;&nbsp;&nbsp;
  <span style="font-size:60px;">🔈</span>
</div>

<br />

# Castafiore Headless

A Docker image that runs [Castafiore](https://github.com/cstaelen/Castafiore) as a self-hosted web app with MPD as the audio backend. Designed for Raspberry Pi and headless servers.



⚠️ WORK IN PROGRESS 

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
      ALSA_DEVICE: plughw:0,0  # run `make devices` or `aplay -l` to list available devices
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
- **Remote** — audio routed through MPD (default in headless mode)
- **Local** — audio played directly in the browser via HTML audio


## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8899` | HTTP port for the web server |
| `ALSA_DEVICE` | `plughw:0,0` | ALSA output device for MPD |

## List available audio devices

```sh
make devices
# or
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
