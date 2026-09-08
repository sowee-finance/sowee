# The marketing site at sowee.site. Built from the repository root: the workspace lockfile lives
# there, and the page reads the market address out of contracts/deployments.
#
#   docker build -f apps/landing/Dockerfile .
#
# NEXT_PUBLIC_* is inlined at build time and the CSP is derived from the RPC origin, so the RPC
# cannot be supplied at run time.
FROM oven/bun:1.3-alpine AS deps
WORKDIR /repo
COPY package.json bun.lock turbo.json ./
COPY apps/web/package.json apps/web/
COPY apps/landing/package.json apps/landing/
COPY apps/api/package.json apps/api/
COPY apps/agent/package.json apps/agent/
COPY apps/ats/package.json apps/ats/
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile

# Bun installs; Node builds — bun dies with SIGILL part way through `next build` on this base.
FROM node:22-alpine AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/landing/node_modules ./apps/landing/node_modules
ARG NEXT_PUBLIC_RPC_URL=https://testnet.hashio.io/api
ENV NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN cd apps/landing && npx --no-install next build

FROM node:22-alpine AS run
WORKDIR /app
RUN adduser -D -u 10001 web
# `output: "standalone"` traces the server's own files; static assets are not traced, so they
# are copied beside it.
COPY --from=build /repo/apps/landing/.next/standalone ./
COPY --from=build /repo/apps/landing/.next/static ./apps/landing/.next/static
USER web
ENV PORT=3000 HOSTNAME=0.0.0.0 NODE_ENV=production
EXPOSE 3000
CMD ["node", "apps/landing/server.js"]
