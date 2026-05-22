# Putting the Atlas behind your existing Authentik + Traefik

This is a wiring guide, not a deployment of Authentik or Traefik — the Atlas
stack runs none of its own. It assumes you already run Traefik (with a file
provider and an ACME/Let's Encrypt resolver) and Authentik (server + embedded
outpost) on the homelab. The reference router/middleware definitions live in
[`traefik-dynamic.yml`](traefik-dynamic.yml); adapt them rather than copy
verbatim.

## The four routes

| Host | Backend service | Protection |
|------|-----------------|------------|
| `atlas.porterble.com` | `atlas-web:80` (Next.js) | Authentik forward-auth |
| `atlas-api.porterble.com` | `atlas-api:8000` (FastAPI) | Authentik forward-auth |
| `atlas-tiles.porterble.com` | `atlas-martin:3000` (Martin) | static token (not forward-auth) |
| `atlas-lineage.porterble.com` | `atlas-marquez:5000` (Marquez) | Authentik forward-auth |

Why tiles are different: a map pulls hundreds of vector tiles per pan/zoom, and
running a forward-auth subrequest on each is slow and noisy. The tile host uses
a shared bearer token instead (see [Tiles](#tiles-without-forward-auth)).

## Networking prerequisite

Traefik, Authentik, and the Atlas containers must share a Docker network so
Traefik can reach `atlas-web`, `atlas-api`, … and the Authentik outpost by
service name. Either attach the Atlas compose project to your existing proxy
network, or add the proxy network to `docker-compose.yml`. Confirm the
Authentik outpost's reachable name/port — this guide uses
`authentik-server:9000` (the embedded outpost); a standalone outpost might be
`authentik-proxy:9000`. Update the address in `traefik-dynamic.yml` to match.

## Authentik side

Create one provider + application, then expose it on an outpost.

1. **Provider** → *Create* → **Proxy Provider**.
   - Name: `atlas-forward-auth`
   - Authorization flow: your usual `default-provider-authorization-implicit-consent`
   - Mode: **Forward auth (domain level)** — one provider covers every
     `*.porterble.com` subdomain. (Use *single application* mode instead if you
     want a separate provider per host.)
   - External host: `https://atlas.porterble.com` (any of the protected hosts)
   - Cookie domain: `porterble.com` — lets the session cookie span the
     subdomains so you sign in once.
   - Token validity / skip-path settings: defaults are fine.

2. **Application** → *Create*.
   - Name: `QLD Capital Investment Atlas`
   - Slug: `atlas`
   - Provider: `atlas-forward-auth`
   - Bind the groups/users you want to allow under *Policy / Group / User
     Bindings* (e.g. just yourself).

3. **Outpost** → edit the **embedded outpost** (or your dedicated Traefik
   outpost) → add the `atlas-forward-auth` provider to *Selected providers* →
   save. The outpost now serves the auth endpoints under
   `/outpost.goauthentik.io/` and answers Traefik's
   `…/auth/traefik` subrequest.

## Traefik side

Two pieces per protected host (both already in `traefik-dynamic.yml`):

1. **The forward-auth middleware** — calls the outpost and, on 2xx, copies the
   identity headers downstream:

   ```yaml
   http:
     middlewares:
       authentik:
         forwardAuth:
           address: "http://authentik-server:9000/outpost.goauthentik.io/auth/traefik"
           trustForwardHeader: true
           authResponseHeaders:
             - X-authentik-username
             - X-authentik-groups
             - X-authentik-email
             - X-authentik-uid
   ```

2. **An outpost path router** at higher priority than the app router, so the
   browser login redirect and callback resolve on the app's own hostname:

   ```yaml
   atlas-web-outpost:
     rule: "Host(`atlas.porterble.com`) && PathPrefix(`/outpost.goauthentik.io/`)"
     priority: 100
     service: authentik          # -> http://authentik-server:9000
   ```

The app router then just adds `middlewares: ["authentik"]`. Repeat the pair for
`atlas-api` and `atlas-lineage`.

> If you prefer Docker labels over the file provider, the equivalent on the
> `web` service is:
> ```yaml
> labels:
>   - "traefik.enable=true"
>   - "traefik.http.routers.atlas-web.rule=Host(`atlas.porterble.com`)"
>   - "traefik.http.routers.atlas-web.middlewares=authentik@file"
>   - "traefik.http.routers.atlas-web.tls.certresolver=letsencrypt"
> ```
> keeping the `authentik` middleware itself in the file provider.

### Identity headers in the app

After auth, the backends receive `X-authentik-username`, `-email`, `-groups`,
`-uid`. The Atlas doesn't enforce its own roles — being allowed through the
forward-auth is the whole gate — but FastAPI can read `X-authentik-username`
from the request headers if you later want per-user behaviour. Nothing is
required for the default "let my household in" posture.

## Tiles without forward-auth

`atlas-tiles.porterble.com` (Martin) is reached directly by the browser for
every tile, so it sits behind a shared token instead of Authentik:

- Set a token and have Traefik require it (e.g. a small header/he query check
  via a plugin or an `headers` middleware that the frontend satisfies), or front
  Martin with a tiny auth shim. The reference config marks tile requests with
  `X-Atlas-Tiles` as a placeholder — replace with your token check.
- The frontend already reads `NEXT_PUBLIC_TILES_URL`; append the token there so
  every `MVTLayer` request carries it.

If you'd rather keep it simple, you can also leave the tile host on the same
forward-auth as the rest and accept the extra subrequests — it works, it's just
chattier.

## DNS & certificates

Point the four subdomains at the Traefik host (A/AAAA or a `*.porterble.com`
wildcard). Traefik's existing ACME resolver issues certs on first request; the
reference routers reference `certResolver: letsencrypt` — rename to your
resolver. For a homelab-only setup you can use the DNS-01 challenge so nothing
needs to be internet-exposed.

## Verify

1. `docker compose up -d` the Atlas core, attached to the proxy network.
2. Reload Traefik (file provider auto-reloads) and check the dashboard shows the
   `atlas-*` routers healthy.
3. Hit `https://atlas.porterble.com` in a fresh browser → you should bounce to
   the Authentik login, then land on the map.
4. `curl -I https://atlas-api.porterble.com/health` without a session → expect a
   302 to Authentik; with a valid session cookie → `200` and JSON.
5. Confirm tiles load on the map (token path) and that
   `atlas-lineage.porterble.com` shows Marquez behind auth.

## Troubleshooting

- **Redirect loop / 401 from the outpost:** the `/outpost.goauthentik.io/`
  router is missing or lower priority than the app router. It must win.
- **`address` unreachable:** Traefik can't resolve `authentik-server` — shared
  network or wrong service name/port.
- **Signed in but headers absent downstream:** add the header names to
  `authResponseHeaders`.
- **Cookie doesn't persist across subdomains:** set the provider's cookie domain
  to `porterble.com`, not a single host.
