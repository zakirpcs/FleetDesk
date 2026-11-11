#!/usr/bin/env bash
# Install the Fleet Desk frontend on RHEL 10.x with Nginx, SELinux enforcing and firewalld.
# Run as root from the unpacked fleet-frontend directory:  sudo bash deploy/install-rhel10.sh
set -euo pipefail

APP_DIR=/var/www/fleetdesk
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOSTNAME_FQDN="${1:-$(hostname -f)}"

echo "==> Installing nginx"
dnf -y install nginx policycoreutils-python-utils openssl

echo "==> Copying site to ${APP_DIR}"
install -d -m 0755 "${APP_DIR}"
rm -rf "${APP_DIR:?}/index.html" "${APP_DIR:?}/assets"
cp -a "${SRC_DIR}/index.html" "${SRC_DIR}/assets" "${APP_DIR}/"
chown -R root:root "${APP_DIR}"
find "${APP_DIR}" -type d -exec chmod 0755 {} +
find "${APP_DIR}" -type f -exec chmod 0644 {} +

echo "==> SELinux labels"
semanage fcontext -a -t httpd_sys_content_t "${APP_DIR}(/.*)?" 2>/dev/null || \
  semanage fcontext -m -t httpd_sys_content_t "${APP_DIR}(/.*)?"
restorecon -Rv "${APP_DIR}" >/dev/null
# Needed later so nginx can proxy /api/ to the backend on localhost
setsebool -P httpd_can_network_connect 1

echo "==> TLS certificate"
if [[ ! -f /etc/pki/tls/certs/fleetdesk.crt ]]; then
  echo "    No certificate found; creating a self-signed one for ${HOSTNAME_FQDN}."
  echo "    Replace it with a certificate from your internal CA before go-live."
  openssl req -x509 -newkey rsa:3072 -sha256 -days 365 -nodes \
    -keyout /etc/pki/tls/private/fleetdesk.key -out /etc/pki/tls/certs/fleetdesk.crt \
    -subj "/CN=${HOSTNAME_FQDN}" -addext "subjectAltName=DNS:${HOSTNAME_FQDN}"
  chmod 0600 /etc/pki/tls/private/fleetdesk.key
  restorecon -v /etc/pki/tls/private/fleetdesk.key /etc/pki/tls/certs/fleetdesk.crt >/dev/null
fi

echo "==> Nginx config"
sed "s/fleet.example.local/${HOSTNAME_FQDN}/g" "${SRC_DIR}/deploy/fleetdesk.conf" > /etc/nginx/conf.d/fleetdesk.conf
nginx -t
systemctl enable --now nginx
systemctl reload nginx

echo "==> Firewall"
if systemctl is-active --quiet firewalld; then
  firewall-cmd --permanent --add-service=http --add-service=https
  firewall-cmd --reload
fi

echo "Done. Open https://${HOSTNAME_FQDN}/"
