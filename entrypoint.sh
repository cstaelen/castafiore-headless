#!/bin/sh
mkfifo /tmp/mpd.fifo 2>/dev/null || true
mpd --no-daemon /etc/mpd.conf &

# Ensure presets dir exists and populate defaults if empty
mkdir -p /config/presets
if [ -z "$(ls -A /config/presets 2>/dev/null)" ]; then
    echo "[castafiore] No presets found — copying defaults to /config/presets/ with device: ${ALSA_DEVICE:-hw:0,0}"
    for f in /etc/camilladsp-presets/*.yml; do
        sed "s|hw:0,0|${ALSA_DEVICE:-hw:0,0}|g" "$f" > "/config/presets/$(basename "$f")"
    done
fi

# Use flat preset as default config if none exists
if [ ! -f /config/camilladsp.yml ]; then
    echo "[castafiore] No /config/camilladsp.yml found — using flat preset"
    cp /config/presets/flat.yml /config/camilladsp.yml
fi

camilladsp /config/camilladsp.yml &
node /app/api/index.js
