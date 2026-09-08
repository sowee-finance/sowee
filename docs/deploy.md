# Deploying Sowee

Three services: the Next.js app, the Go API and the marketing site. All ship as containers
(`apps/web/Dockerfile`, `apps/api/Dockerfile`, `apps/landing/Dockerfile`) behind whatever reverse
proxy already terminates TLS for the domain.

| Service | Container port | Public name |
|---|---|---|
| web | 3000 | `app.sowee.site` |
| api | 8080 | `api.sowee.site` |
| landing | 3000 | `sowee.site` |

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

Point the app at a different API and it has to be rebuilt, not restarted. The landing has one of
its own, `NEXT_PUBLIC_RPC_URL`, for the same reason — its CSP is derived from that origin — and it
reads the market address out of `contracts/deployments/296.json` at build time, so a redeploy of
the contracts means a rebuild of the landing too.

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

## Do not build on the host

Images are built by `.github/workflows/images.yml` and pushed to GHCR:

- `ghcr.io/sowee-finance/sowee-web`
- `ghcr.io/sowee-finance/sowee-api`
- `ghcr.io/sowee-finance/sowee-landing`

Deploying is a pull:

```sh
docker pull ghcr.io/sowee-finance/sowee-web:latest
docker rm -f sowee-web
docker run -d --name sowee-web --restart unless-stopped \
  -p 127.0.0.1:3000:3000 ghcr.io/sowee-finance/sowee-web:latest
```

The landing is the same, on its own host port. Every image listens on 3000 inside the container,
so the host port is whatever the `sowee.site` vhost already proxies to — check before you bind it,
because a mismatch is the 502 you will then spend ten minutes on:

```sh
grep -r proxy_pass /etc/nginx/sites-enabled/ | grep sowee.site   # the port the vhost expects
docker pull ghcr.io/sowee-finance/sowee-landing:latest
docker rm -f sowee-landing 2>/dev/null
docker run -d --name sowee-landing --restart unless-stopped \
  -p 127.0.0.1:<that port>:3000 ghcr.io/sowee-finance/sowee-landing:latest
curl -sI localhost:<that port> | head -1                          # 200 before you reload nginx
```

This is not a preference. The host that serves these is a small shared box running thirty other
sites, and building the Next app on it took the whole machine down twice: a burst of Docker
build I/O, then the VM gone a few minutes later, and on the way back up the platform's
auto-deploy started the same builds again. A CI runner has the machine to itself and the host
only ever runs containers, which it has always done comfortably — twenty-six of them fit in
2 GB.

### A host with no registry credentials

`workflow_dispatch` on the images workflow takes a `bundle` input. It saves both images and
uploads them as an artifact:

```sh
gh workflow run images.yml -f bundle=true
gh run download <run-id> -n images -D ./img
cat img/sowee-api.tar | ssh <host> docker load
cat img/sowee-web.tar | ssh <host> docker load
cat img/sowee-landing.tar | ssh <host> docker load
```

Around 90 MB for the app and the API, and the landing is the smaller of the two Next images. The
host still builds nothing.

### Cutting over behind an existing proxy

Run the new containers on free ports, check them there, and only then move the proxy. Leave the
previous containers running on their own ports: rolling back is a proxy change, and nothing has
to be rebuilt.

If you ever must build on a constrained host, cap it so an overrun is killed instead of the
machine (`docker run --memory=3g --memory-swap=3g --cpus=2 …`), and turn off the platform's
auto-deploy first so a reboot does not trigger every build at once.

## Rollback

Keep the previous container. Switching back is a proxy change and a restart, not a rebuild.
