#!/usr/bin/env sh
set -eu

add_nix_library_path() {
  pattern="$1"
  library_path="$(find /nix/store -path "$pattern" -print -quit 2>/dev/null || true)"
  if [ -n "$library_path" ]; then
    library_dir="$(dirname "$library_path")"
    export LD_LIBRARY_PATH="$library_dir:${LD_LIBRARY_PATH:-}"
  fi
}

add_nix_library_path "*-gcc-*-lib/lib/libstdc++.so.6"
add_nix_library_path "*-zlib-*/lib/libz.so.1"

uv run alembic upgrade head
uv run python -m app.cli seed-demo
exec uv run uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8080}"
