#!/bin/sh
mpd --no-daemon /etc/mpd.conf &
node /app/mpd-server.js
