# Berth

A self-hosted Docker registry with a complete management dashboard. One `docker compose up` gives you the official [distribution](https://hub.docker.com/_/registry) registry (v3) plus a Next.js + shadcn/ui app to browse, inspect, clean up and administer it.

## Features

- **Repositories**: grouped by namespace, search, sort by size/updates/pulls, per-repo stats, `⌘K` jump-to-repository.
- **Image detail**: multi-arch platforms, layers mapped to their Dockerfile step, full build history, env/labels/entrypoint/ports, attestations, raw manifest, pull-by-tag and pull-by-digest commands.
- **Tag history**: every digest a tag has pointed to, from registry push events.
- **Safe deletes**: the registry deletes by digest, so Berth shows every other tag that goes with it before you confirm.
- **Cleanup policies**: keep the newest N tags, delete by age, regex tag filters, protected tags, glob repository matching. Preview before running; daily schedule optional. A tag is never deleted if a kept tag shares its image.
- **Garbage collection**: dry run or real run with live output, optional `--delete-untagged`, disk freed reported. Prune empty repositories from the catalog.
- **Activity**: push/pull/delete events via registry notifications, 30-day chart, per-repository feed, and an audit log of everything done in Berth.
- **Users**: create registry accounts, reset passwords, admin/viewer roles. The registry reloads its htpasswd file live, so no restarts.
- **REST API** with scoped API tokens, plus registry metrics and disk usage.
- Light and dark themes.

## Quick start

```bash
cp .env.example .env        # set ADMIN_PASSWORD and WEBHOOK_TOKEN
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

- Dashboard: http://localhost:3000 (sign in as `ADMIN_USERNAME` / `ADMIN_PASSWORD`)
- Registry: `docker login localhost:5000` with the same credentials

## Production

`docker-compose.yml` publishes no ports; put a reverse proxy in front of two services:

| Service    | Port | Purpose                       |
|------------|------|-------------------------------|
| `registry` | 5000 | `docker push` / `docker pull` (TLS required for non-localhost hosts) |
| `berth`    | 3000 | Dashboard and API             |

Set `REGISTRY_PUBLIC_HOST` to the registry's hostname and `REGISTRY_DATA_PATH` to where layers should live (any host path, e.g. a mounted storage box). Berth's own SQLite database stays on the `berth-data` volume; keep it on local disk, since SQLite locking is unreliable on network filesystems.

### Dokploy

Create a **Compose** service from this Git repository (compose path `./docker-compose.yml`), add the environment variables, then two domains: `registry` → port 5000 and `berth` → port 3000.

## Configuration

| Variable | Default | |
|---|---|---|
| `REGISTRY_PUBLIC_HOST` | required | Hostname shown in pull/push commands |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / required | Bootstrap admin, also Berth's account on the registry |
| `WEBHOOK_TOKEN` | required | Shared secret for registry → Berth notifications |
| `SESSION_SECRET` | generated | Signs dashboard sessions |
| `REGISTRY_DATA_PATH` | `./data/registry` | Host path for registry storage |
| `REGISTRY_HTTP_SECRET` | random | Only needed for several registry replicas |

Running Berth against an existing registry instead? Point `REGISTRY_URL` at it. Features that need the registry's files (user management, garbage collection, disk usage) switch off automatically when `HTPASSWD_PATH` / `REGISTRY_STORAGE_PATH` / `REGISTRY_CONFIG_PATH` are unset.

## API

Authenticate with the session cookie or `Authorization: Bearer berth_…` (create tokens in Settings).

```
GET    /api/v1/repositories
GET    /api/v1/repository?name=team/app
GET    /api/v1/image?repository=team/app&reference=1.0
DELETE /api/v1/image?repository=team/app&reference=1.0      (admin)
GET    /api/v1/events?repository=&action=push&limit=50
POST   /api/v1/gc                {"dryRun": false}           (admin)
POST   /api/v1/policies/:id/run  {"dryRun": false}           (admin)
GET    /api/v1/jobs/:id
GET    /api/health
```

## Notes

- Garbage collection runs `registry garbage-collect` on the shared volume while the registry keeps serving. Avoid pushing during a run.
- The registry logs its notification headers (including `WEBHOOK_TOKEN`) at startup.

## Development

```bash
bun install
REGISTRY_URL=http://localhost:5000 ADMIN_PASSWORD=… bun dev
```

Next.js 16 (App Router, server actions), React 19, Tailwind CSS 4, shadcn/ui, SQLite via `node:sqlite`. Requires Node 24.

## License

MIT
