#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run as root' >&2; exit 1; }
CONFIG=/etc/nginx/sites-available/presspass
[[ -f "$CONFIG" ]] || { echo "Missing $CONFIG" >&2; exit 1; }
cp -a "$CONFIG" "$CONFIG.before-encrypted-uploads.$(date -u +%Y%m%dT%H%M%SZ)"
python3 - "$CONFIG" <<'PY'
import re,sys
path=sys.argv[1]; value=open(path,encoding='utf-8').read()
updated=re.sub(r'\n\s*(?:#\s*Фотографії[^\n]*\n)?\s*location\s+/uploads/\s*\{[^{}]*\}\s*', '\n', value)
if updated == value:
    print('No direct /uploads location found; already disabled.')
else:
    open(path,'w',encoding='utf-8').write(updated)
    print('Removed direct /uploads location.')
PY
nginx -t
systemctl reload nginx
