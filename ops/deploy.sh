#!/usr/bin/env bash
# Deploy only this site's static files. Initial Nginx/DNS/TLS setup is separate.
set -euo pipefail
if [[ $# != 1 ]]; then
  echo 'Usage: ./ops/deploy.sh user@server' >&2
  exit 1
fi
target=$1
if [[ ! "$target" =~ ^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+$ ]]; then
  echo 'Invalid SSH target' >&2
  exit 1
fi
cd "$(dirname "$0")/.."
if [[ -n "$(git status --porcelain)" ]]; then
  echo 'Commit or stash changes before deploying a traceable release.' >&2
  exit 1
fi
npm ci
npm test
npm run build
release_id=$(git rev-parse HEAD)
if [[ ! "$release_id" =~ ^[0-9a-f]{40}$ ]]; then exit 1; fi
site_root=/var/www/mark.aayu.today
ssh -o BatchMode=yes "$target" "sudo -n install -d -o \$(id -un) -g www-data -m 755 $site_root/releases/$release_id"
rsync -a dist/ "$target:$site_root/releases/$release_id/"
ssh -o BatchMode=yes "$target" "set -e; chmod -R u=rwX,go=rX $site_root/releases/$release_id; sudo -n ln -sfn $site_root/releases/$release_id $site_root/.next-$release_id; sudo -n mv -Tf $site_root/.next-$release_id $site_root/current; curl --fail --silent --resolve mark.aayu.today:443:127.0.0.1 https://mark.aayu.today/ >/dev/null"
echo "Published release $release_id"
