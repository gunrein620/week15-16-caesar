#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/user/apps/week15-16-caesar"
NODE_BIN="/home/user/.nvm/versions/node/v22.22.3/bin/node"
NPM_BIN="/home/user/.nvm/versions/node/v22.22.3/bin/npm"
NPX_BIN="/home/user/.nvm/versions/node/v22.22.3/bin/npx"
PORT="${PORT:-3400}"

rsync -az --delete \
  --exclude='.git/' \
  --exclude='.env' \
  --exclude='.next/' \
  --exclude='node_modules/' \
  --exclude='logs/' \
  --exclude='.claude/' \
  ./ "rpi:${APP_DIR}/"

ssh rpi bash -s <<REMOTE
set -euo pipefail

APP_DIR="${APP_DIR}"
NODE_BIN="${NODE_BIN}"
NPM_BIN="${NPM_BIN}"
NPX_BIN="${NPX_BIN}"
PORT="${PORT}"

cd "\$APP_DIR"
"\$NPM_BIN" ci
"\$NPM_BIN" run db:generate
"\$NPX_BIN" prisma migrate deploy
"\$NPM_BIN" run build

mkdir -p "\$APP_DIR/logs"
cp "\$APP_DIR/.env" "\$APP_DIR/.next/standalone/.env"
rm -rf "\$APP_DIR/.next/standalone/.next/static"
cp -R "\$APP_DIR/.next/static" "\$APP_DIR/.next/standalone/.next/static"
rm -rf "\$APP_DIR/.next/standalone/public"
if [ -d "\$APP_DIR/public" ]; then
  cp -R "\$APP_DIR/public" "\$APP_DIR/.next/standalone/public"
fi

OLD_PID=\$(ss -ltnp 2>/dev/null | awk "/:\$PORT /{print}" | sed -n 's/.*pid=\\([0-9][0-9]*\\).*/\\1/p' | head -1)
if [ -n "\$OLD_PID" ]; then
  kill "\$OLD_PID"
  for _ in \$(seq 1 20); do
    if kill -0 "\$OLD_PID" 2>/dev/null; then
      sleep 0.5
    else
      break
    fi
  done
  if kill -0 "\$OLD_PID" 2>/dev/null; then
    kill -9 "\$OLD_PID"
  fi
fi

set -a
. "\$APP_DIR/.env"
set +a

cd "\$APP_DIR/.next/standalone"
nohup "\$NODE_BIN" server.js >> "\$APP_DIR/logs/server.log" 2>&1 &
echo "Started rpi server on port \$PORT with PID \$!"
REMOTE
