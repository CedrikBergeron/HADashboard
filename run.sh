#!/bin/sh
set -eu

mkdir -p /data/dashboard

if [ ! -f /data/dashboard/homes/main.json ]; then
  cp -R /app/defaults/. /data/dashboard/
fi

rm -rf /app/data
ln -s /data/dashboard /app/data

exec node /app/server/server.mjs
