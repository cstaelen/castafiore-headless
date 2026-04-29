# ── Stage 1: build Castafiore web ───────────────────────────────────────────
FROM node:25-alpine AS builder

RUN apk add --no-cache git

WORKDIR /build

RUN git clone --depth 1 --branch feat/headless https://github.com/cstaelen/Castafiore.git . \
    && npm ci

ENV PLATFORM=web \
    EXPO_PUBLIC_IS_HEADLESS=true
RUN npx expo export -p web && npx workbox generateSW workbox-config.js

# ── Stage 2: build MPD (ALSA only) ───────────────────────────────────────────
FROM node:25-alpine AS mpd-builder

RUN apk add --no-cache meson ninja pkgconf g++ git alsa-lib-dev fmt-dev pcre2-dev

RUN git clone --depth 1 --branch v0.24.4 https://github.com/MusicPlayerDaemon/MPD.git /mpd \
    && meson setup /mpd/build /mpd \
    --prefix=/usr/local \
    --buildtype=release \
    -Dalsa=enabled \
    -Dipv6=disabled \
    -Ddsd=false \
    -Ddaemon=false \
    -Dsyslog=disabled \
    -Dchromaprint=disabled \
    -Dcurl=disabled \
    -Dexpat=disabled \
    -Did3tag=disabled \
    -Dio_uring=disabled \
    -Dmad=disabled \
    -Dmpcdec=disabled \
    -Dnfs=disabled \
    -Dopus=disabled \
    -Dpulse=disabled \
    -Dpipewire=disabled \
    -Dqobuz=disabled \
    -Dshout=disabled \
    -Dsndfile=disabled \
    -Dsoxr=disabled \
    -Dsqlite=disabled \
    -Dudisks=disabled \
    -Dupnp=disabled \
    -Dvorbis=disabled \
    -Dvorbisenc=disabled \
    -Dwavpack=disabled \
    -Dzeroconf=disabled \
    -Daudiofile=disabled \
    -Dfaad=disabled \
    -Dffmpeg=disabled \
    -Dflac=disabled \
    -Dfluidsynth=disabled \
    -Dgme=disabled \
    -Diso9660=disabled \
    -Djack=disabled \
    -Dlame=disabled \
    -Dmikmod=disabled \
    -Dmodplug=disabled \
    -Dmpg123=disabled \
    -Dopenal=disabled \
    -Dpipe=false \
    -Drecorder=false \
    -Dsidplay=disabled \
    -Dtwolame=disabled \
    -Dwildmidi=disabled \
    && ninja -C /mpd/build install

# ── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM node:25-alpine

ENV PORT=8899 \
    ALSA_DEVICE="plughw:0,0"

RUN apk add --no-cache alsa-lib alsa-utils fmt pcre2

COPY --from=mpd-builder /usr/local/bin/mpd /usr/local/bin/mpd
COPY --from=builder /build/dist /app/dist
COPY mpd.conf /etc/mpd.conf
COPY mpd-server.js /app/mpd-server.js
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
    && mkdir -p /var/lib/mpd/music /var/lib/mpd/playlists

EXPOSE 8899

CMD ["/entrypoint.sh"]
