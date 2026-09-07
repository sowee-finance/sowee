# Deploying Sowee

Two services: the Next.js app and the Go API. Both ship as containers
(`apps/web/Dockerfile`, `apps/api/Dockerfile`) behind whatever reverse proxy already terminates
TLS for the domain.

| Service | Container port | Public name |
|---|---|---|
| web | 3000 | `app.sowee.site` |
| api | 8080 | `api.sowee.site` |

## Build arguments are not run-time settings

Next inlines every `NEXT_PUBLIC_*` value into the client bundle, and the app's Content-Security
-Policy is derived from the API origin at build time. Both are therefore **build arguments**:

```sh
docker build -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_CHAIN_ID=296 \
  --build-arg NEXT_PUBLIC_API_URL=https://api.sowee.site \
  --build-arg NEXT_PUBLIC_HCS_TOPIC_ID=0.0.10388277 \
  -t sowee-web .
```

Point the app at a different API and it has to be rebuilt, not restarted.

## The API's environment

Everything the API needs is documented in `apps/api/.env.example`. It holds signing keys, so it
belongs in a `0600` file outside the repository and is passed with `--env-file`:

```sh
docker build -f apps/api/Dockerfile -t sowee-api apps/api
docker run -d --name sowee-api --restart unless-stopped \
  -p 127.0.0.1:8080:8080 --env-file ~/sowee-run/api.env sowee-api
```

Two values matter in production and nowhere else:

- `WEB_ORIGIN=https://app.sowee.site` — CORS answers this origin and no other.
- `TRUSTED_PROXY=true` — only set this when the API really is behind your own proxy, because it
  makes the rate limiter believe `X-Forwarded-For`.

## Building on a small or shared host

The Next build is the memory-hungry step. On a box that is also serving other things, run it in a
container with a hard cap so an overrun is killed instead of the host:

```sh
docker run --rm --memory=3g --memory-swap=3g --cpus=2 \
  -v "$PWD:/repo" -w /repo \
  -e NEXT_PUBLIC_CHAIN_ID=296 -e NEXT_PUBLIC_API_URL=https://api.sowee.site \
  oven/bun:1.3-alpine sh -c "bun install --frozen-lockfile && cd apps/web && bun run build"
```

Then package the traced output — `.next/standalone`, `.next/static` and `public` — into
`node:22-alpine`. This is what `apps/web/Dockerfile`'s final stage does; splitting it apart just
puts the cap around the part that needs one.

## Rollback

Keep the previous container. Switching back is a proxy change and a restart, not a rebuild.
