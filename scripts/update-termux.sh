#!/usr/bin/env bash
set -euo pipefail
umask 077

release=$(cd -- "$(dirname -- "$0")/.." && pwd -P)
if [[ $# != 1 || ! -d "$1" ]]; then
  printf '%s\n' 'Informe o caminho da pasta em que a V5 está instalada.' >&2
  exit 1
fi
installed=$(cd -- "$1" && pwd -P)

version() {
  (cd -- "$1" && node -p 'require("./package.json").version')
}

if [[ "$release" == "$installed" || $(version "$release") != 6.* || $(version "$installed") != 5.* && $(version "$installed") != 6.* ]]; then
  printf '%s\n' 'Execute o script da V6 extraída e aponte para uma instalação separada da V5.' >&2
  exit 1
fi

cd -- "$installed"
env_args=()
if [[ -f .env ]]; then env_args+=(--env-file=.env); fi
mkdir -p -- backups
snapshot_dir=$(mktemp -d "$installed/backups/pre-v6-XXXXXXXX")
node "${env_args[@]}" scripts/maintenance.mjs backup "$snapshot_dir/tutan.sqlite"

# A V6 usa as mesmas dependências da V5. Reinstale se o runtime foi trocado.
if ! node --no-warnings -e 'require("ipaddr.js"); try { require("node:sqlite"); } catch { require("better-sqlite3"); }' 2>/dev/null; then
  if node --no-warnings -e 'require("node:sqlite")' >/dev/null 2>&1; then
    npm ci --omit=dev --omit=optional
  else
    npm ci --omit=dev --include=optional
  fi
fi

# Mantém a origem do navegador, o banco, o arquivo de ambiente e os dados locais.
for item in public server scripts server.js package.json package-lock.json README.md EDITOR.md render.yaml .env.example .gitignore; do
  cp -R -- "$release/$item" "$installed/"
done
printf 'Backup da V5: %s\n' "$snapshot_dir/tutan.sqlite"
printf '%s\n' 'Arquivos da V6 instalados. Inicie pela mesma porta usada na V5.'
