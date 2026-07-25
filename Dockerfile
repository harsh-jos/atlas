# syntax=docker/dockerfile:1
# Next.js web app. Kept deliberately simple (single stage) for local-first dev:
# dev deps (typescript) stay in the image for the build.
FROM node:22-slim

WORKDIR /app

# ca-certificates for outbound TLS.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies first so this layer caches across source changes.
# `npm install` (not `npm ci`) because native/wasm optional deps (turbopack,
# tailwind oxide) resolve per-platform, and the lockfile is generated on macOS —
# `npm ci`'s strict cross-platform check fails on the Linux-only variants.
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

COPY . .

# Pages are dynamic and fetch from the API, so no database is needed at build time.
RUN npm run build

EXPOSE 3000

# Apply migrations against the live DB, then serve. `migrate deploy` is idempotent.
CMD ["npm", "run", "start"]
