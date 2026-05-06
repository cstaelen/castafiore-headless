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
    alsa-lib-dev \
    curl-dev \
    expat-dev \
    faad2-dev \
    flac-dev \
    fmt-dev \
    g++ \
    libvorbis-dev \
    meson \
    mpg123-dev \
    nlohmann-json \
    samurai \
    opus-dev \
    pcre2-dev \
    pkgconf

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

# ── Stage 3: build CamillaDSP (Rust/musl) ────────────────────────────────────
FROM rust:alpine AS camilladsp-builder

RUN apk add --no-cache \
    alsa-lib-dev \
    musl-dev

ENV RUSTFLAGS="-C target-feature=-crt-static"

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/root/.cargo/registry \
    cargo install \
    --git https://github.com/HEnquist/camilladsp.git \
    --tag v4.1.3 \
    CamillaDSP

# ── Stage 4: runtime ─────────────────────────────────────────────────────────
FROM node:25-alpine

ENV PORT=8899

RUN apk add --no-cache \
    alsa-lib \
    alsa-utils \
    faad2 \
    fmt \
    libcurl \
    libflac \
    libvorbis \
    mpg123-libs \
    opus \
    pcre2 \
    procps

COPY --from=mpd-builder /usr/local/bin/mpd /usr/local/bin/mpd
COPY --from=camilladsp-builder /usr/local/cargo/bin/camilladsp /usr/local/bin/camilladsp
COPY --from=builder /build/dist /app/dist
COPY mpd.conf /etc/mpd.conf
COPY camilladsp/default.yml /etc/camilladsp-default.yml
COPY camilladsp/presets/ /etc/camilladsp-presets/
COPY api/ /app/api/
COPY public/ /app/public/
COPY --chmod=+x entrypoint.sh /entrypoint.sh

RUN mkdir -p /var/lib/mpd/music /var/lib/mpd/playlists /config/presets \
    && touch /var/lib/mpd/state

EXPOSE 8899

CMD ["/entrypoint.sh"]
