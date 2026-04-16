#!/bin/sh
mpd --no-daemon &
node /app/mpd-server.js
