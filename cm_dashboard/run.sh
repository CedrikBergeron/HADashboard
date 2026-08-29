#!/bin/sh
set -eu

mkdir -p /data/dashboard/homes

if [ ! -f /data/dashboard/homes/main.json ]; then
  cp /app/defaults/main.json /data/dashboard/homes/main.json
fi

rm -rf /app/data
ln -s /data/dashboard /app/data

exec node /app/server/server.mjs
