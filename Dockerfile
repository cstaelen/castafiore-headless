# ── Stage 1: build Castafiore web ───────────────────────────────────────────
FROM node:25-alpine AS builder

WORKDIR /build

ADD --link https://github.com/cstaelen/Castafiore.git?ref=feat/headless /build

RUN --mount=type=cache,target=/root/.npm npm ci

ENV PLATFORM=web \
    EXPO_PUBLIC_IS_HEADLESS=true

RUN npx expo export -p web \
	&& npx workbox generateSW workbox-config.js

# ── Stage 2: build MPD (ALSA only) ───────────────────────────────────────────
FROM node:25-alpine AS mpd-builder

RUN apk add --no-cache \
    alsa-lib-dev=1.2.14-r2 \
    curl-dev=8.17.0-r1 \
    faad2-dev=2.11.2-r0 \
    flac-dev=1.4.3-r2 \
    fmt-dev=11.2.0-r1 \
    g++=15.2.0-r2 \
    libvorbis-dev=1.3.7-r2 \
    meson=1.9.1-r0 \
    mpg123-dev=1.33.3-r0 \
    samurai=1.2-r7 \
    opus-dev=1.5.2-r1 \
    pcre2-dev=10.47-r0 \
    pkgconf=2.5.1-r0

ADD --link https://github.com/MusicPlayerDaemon/MPD.git?ref=v0.24.4 /mpd

RUN meson setup /mpd/build /mpd --prefix=/usr/local --buildtype=release \
    && meson setup /mpd/build /mpd \
    --prefix=/usr/local \
    --buildtype=release \
    -Dalsa=enabled \
    -Dcurl=enabled \
    -Dfaad=enabled \
    -Dmpg123=enabled \
    -Dvorbis=enabled \
    -Dopus=enabled \
    -Dflac=enabled \
    -Dipv6=disabled \
    -Ddsd=false \
    -Ddaemon=false \
    -Dsyslog=disabled \
    -Dchromaprint=disabled \
    -Dexpat=disabled \
    -Did3tag=disabled \
    -Dio_uring=disabled \
    -Dmad=disabled \
    -Dmpcdec=disabled \
    -Dnfs=disabled \
    -Dpulse=disabled \
    -Dpipewire=disabled \
    -Dqobuz=disabled \
    -Dshout=disabled \
    -Dsndfile=disabled \
    -Dsoxr=disabled \
    -Dsqlite=disabled \
    -Dudisks=disabled \
    -Dupnp=disabled \
    -Dvorbisenc=disabled \
    -Dwavpack=disabled \
    -Dzeroconf=disabled \
    -Daudiofile=disabled \
    -Dffmpeg=disabled \
    -Dfluidsynth=disabled \
    -Dgme=disabled \
    -Diso9660=disabled \
    -Djack=disabled \
    -Dlame=disabled \
    -Dmikmod=disabled \
    -Dmodplug=disabled \
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

RUN apk add --no-cache \
    alsa-lib=1.2.14-r2 \
    alsa-utils=1.2.14-r4 \
    faad2=2.11.2-r0 \
    fmt=11.2.0-r1 \
    libcurl=8.17.0-r1 \
    libflac=1.4.3-r2 \
    libvorbis=1.3.7-r2 \
    mpg123-libs=1.33.3-r0 \
    opus=1.5.2-r1 \
    pcre2=10.47-r0

COPY --from=mpd-builder /usr/local/bin/mpd /usr/local/bin/mpd
COPY --from=builder /build/dist /app/dist
COPY mpd.conf /etc/mpd.conf
COPY mpd-server.js /app/mpd-server.js
COPY --chmod=+x entrypoint.sh /entrypoint.sh

RUN mkdir -p /var/lib/mpd/music /var/lib/mpd/playlists \
    && touch /var/lib/mpd/state

EXPOSE 8899

CMD ["/entrypoint.sh"]
