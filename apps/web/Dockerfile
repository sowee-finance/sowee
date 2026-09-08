# The Next.js app. Built from the repository root: the workspace lockfile lives there.
#
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.sowee.site .
#
# The NEXT_PUBLIC_* values are read at build time and inlined into the client bundle, and the CSP
# is derived from the API origin, so they cannot be supplied at run time.
FROM oven/bun:1.3-alpine AS deps
WORKDIR /repo
COPY package.json bun.lock turbo.json ./
COPY apps/web/package.json apps/web/
COPY apps/landing/package.json apps/landing/
COPY apps/api/package.json apps/api/
COPY apps/agent/package.json apps/agent/
COPY apps/ats/package.json apps/ats/
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile

# Bun installs; Node builds. Bun dies with SIGILL part way through `next build` on this base,
# and the build is Next's own job anyway — bun is here for the lockfile and the fast install.
FROM node:22-alpine AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
ARG NEXT_PUBLIC_CHAIN_ID=296
ARG NEXT_PUBLIC_API_URL=http://localhost:8080
ARG NEXT_PUBLIC_WORLD_APP_ID=
ARG NEXT_PUBLIC_HCS_TOPIC_ID=
ENV NEXT_PUBLIC_CHAIN_ID=$NEXT_PUBLIC_CHAIN_ID \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WORLD_APP_ID=$NEXT_PUBLIC_WORLD_APP_ID \
    NEXT_PUBLIC_HCS_TOPIC_ID=$NEXT_PUBLIC_HCS_TOPIC_ID \
    NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN cd apps/web && npx --no-install next build

FROM node:22-alpine AS run
WORKDIR /app
RUN adduser -D -u 10001 web
# `output: "standalone"` traces exactly the files the server needs; static assets and public
# files are not traced, so they are copied beside it.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
USER web
ENV PORT=3000 HOSTNAME=0.0.0.0 NODE_ENV=production
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
