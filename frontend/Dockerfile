# Fleet Desk frontend: plain HTML, CSS and ES modules on Nginx. No build step.
#
# Build from the repository root:  docker build -f frontend/Dockerfile .
FROM nginxinc/nginx-unprivileged:1.27-alpine

ENV FLEETDESK_MODE=api

COPY --chown=nginx:nginx frontend/index.html /usr/share/nginx/html/index.html
COPY --chown=nginx:nginx frontend/login.html /usr/share/nginx/html/login.html
COPY --chown=nginx:nginx frontend/assets/    /usr/share/nginx/html/assets/
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY frontend/entrypoint/20-fleetdesk-mode.sh /docker-entrypoint.d/20-fleetdesk-mode.sh

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD ["/bin/sh", "-c", "wget -qO- http://127.0.0.1:8080/healthz >/dev/null"]
