# syntax=docker/dockerfile:1
# The production image. Node 26 runs the TypeScript directly, so there is no build stage:
# the first stage installs production dependencies, the second copies them next to the source
# and runs as the unprivileged node user. Migrations run as a separate release step
# (node scripts/migrate.ts), never inside the server's startup.

FROM node:26.12.0-trixie-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Exactly the lockfile's versions, without vitest, drizzle-kit, and the other dev tools.
RUN npm ci --omit=dev

FROM node:26.12.0-trixie-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY drizzle ./drizzle
COPY scripts/migrate.ts ./scripts/migrate.ts
COPY views ./views
COPY public ./public
# Posters are written here at runtime: mount a volume, and let the node user own it.
RUN mkdir -p uploads/posters && chown -R node:node uploads
USER node
EXPOSE 3000
# Exec form: Node is PID 1's child directly and receives SIGTERM itself, so shutdown is graceful.
CMD ["node", "src/server.ts"]
