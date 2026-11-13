# Fleet Desk API — see API_CONTRACT.md
#
# Build from the repository root so the shared business-rule modules can be copied
# out of frontend/assets/js:  docker build -f backend/Dockerfile .
FROM node:22-alpine AS deps
WORKDIR /app
COPY backend/package.json ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:22-alpine
ENV NODE_ENV=production \
    TZ=Asia/Dhaka \
    PORT=8080
WORKDIR /app

RUN apk add --no-cache tzdata curl

COPY --from=deps /app/node_modules ./node_modules
COPY backend/package.json ./
COPY backend/scripts ./scripts
COPY backend/src ./src
COPY backend/test ./test

# The API applies these at startup, so the schema travels with the image.
COPY db/migrations ./db/migrations

# One definition of the email templates, overtime rules and demo data: copy them
# from the frontend source instead of maintaining a second implementation.
COPY frontend/assets/js/utils.js frontend/assets/js/calc.js frontend/assets/js/papers.js frontend/assets/js/email.js frontend/assets/js/sms.js frontend/assets/js/seed.js /tmp/shared/
RUN node scripts/sync-shared.mjs /tmp/shared && rm -rf /tmp/shared

USER node
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD curl -fsS http://127.0.0.1:8080/readyz || exit 1

CMD ["node", "src/server.js"]
