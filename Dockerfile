# hadolint ignore=DL3008
# ── Stage 1: build Castafiore web ───────────────────────────────────────────
FROM node:20-slim AS builder

# hadolint ignore=DL3008
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

RUN git clone --depth 1 --branch feat/headless https://github.com/cstaelen/Castafiore.git . \
    && npm ci

ENV PLATFORM=web \
    EXPO_PUBLIC_IS_HEADLESS=true
RUN npx expo export -p web && npx workbox generateSW workbox-config.js

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:20-slim

ENV PORT=8899 \
    ALSA_DEVICE="plughw:0,0"

# hadolint ignore=DL3008
RUN apt-get update && apt-get install -y --no-install-recommends \
    mpd \
    alsa-utils \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/dist /app/dist
COPY mpd.conf /etc/mpd.conf
COPY mpd-server.js /app/mpd-server.js
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8899

CMD ["/entrypoint.sh"]
