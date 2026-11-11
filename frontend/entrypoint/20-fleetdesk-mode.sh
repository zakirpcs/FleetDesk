#!/bin/sh
# Sets the data mode the frontend starts in. The container serves the app against the
# REST API by default; FLEETDESK_MODE=mock falls back to the browser-only demo data.
set -eu

MODE="${FLEETDESK_MODE:-api}"
INDEX=/usr/share/nginx/html/index.html

case "$MODE" in
  api|mock) ;;
  *) echo "fleetdesk: FLEETDESK_MODE must be 'api' or 'mock', got '$MODE'" >&2; exit 1 ;;
esac

# Written in place through the existing file: the image runs as an unprivileged user
# that owns index.html but not the directory, so sed -i (which needs a temp file there)
# would fail.
sed "s|<meta name=\"fleetdesk-mode\" content=\"[a-z]*\">|<meta name=\"fleetdesk-mode\" content=\"$MODE\">|" "$INDEX" > /tmp/index.html
cat /tmp/index.html > "$INDEX"
rm -f /tmp/index.html
grep -q "content=\"$MODE\"" "$INDEX" || { echo "fleetdesk: could not set the mode tag in $INDEX" >&2; exit 1; }
echo "fleetdesk: serving in $MODE mode"
