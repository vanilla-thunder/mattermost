# Deploying Vibemost

Vibemost is the Mattermost web client with local changes, including a Nextcloud calendar in
the sidebar. It runs as a container: nginx serves the client and proxies every server call
to an existing Mattermost server. The Mattermost server itself is not modified, and its
stock web client keeps working at its own address.

```
browser ──> TLS reverse proxy ──> vibemost container (nginx, port 80)
                                    ├─ /                       the built web client
                                    ├─ /api, /plugins, ...     ──> VIBEMOST_MATTERMOST_URL
                                    ├─ /vibemost-nextcloud/    ──> VIBEMOST_NEXTCLOUD_URL (read-only CalDAV)
                                    └─ /vibemost/config.json   runtime settings for the client
```

Nothing deployment-specific is built into the image. Every setting comes from environment
variables when the container starts, so one image works for any server.

## Configuration

Copy `.env.example` to `.env` (ignored by git) and fill it in:

| Variable | Required | Meaning |
|---|---|---|
| `VIBEMOST_MATTERMOST_URL` | yes | The Mattermost server's SiteURL, e.g. `https://chat.example.com` |
| `VIBEMOST_NEXTCLOUD_URL` | no | The Nextcloud server for the calendar. It is proxied on the same origin, so it needs no CORS setup. |
| `VIBEMOST_JITSI_HOSTS` | no | Comma-separated Jitsi host names whose links get a join button. Teams links are always recognized. |
| `VIBEMOST_HTTP_PORT` | no | Host port the container is published on (compose only, default `8080`) |
| `VIBEMOST_MAX_BODY_SIZE` | no | Largest upload, default `100m`. Keep it at or above Mattermost's MaxFileSize. |

The container checks every value at start-up and refuses to start with an invalid one.

The webpack dev server (`cd webapp && npm run dev-server`) reads the same `.env` file.
Variables set in the shell take precedence.

## Build

**Always build the image on a development machine, never on the server.** The build runs
`npm ci` and the full production web app build, which takes several minutes and needs more
memory than a small server has: on a VPS with 3.3 GiB of RAM and no swap it fails with

```
failed to solve: process "/bin/sh -c npm run build && find channels/dist -name '*.map' -delete" did not complete successfully: exit code: 1
```

From the repository root on the development machine:

```sh
docker build -f deploy/vibemost/Dockerfile -t vibemost:latest .
```

Source maps are left out of the image. Build for the server's CPU architecture; add
`--platform linux/amd64` when building on an ARM machine such as an Apple Silicon Mac.

## Upload

Copy the image to the server over SSH, without a registry:

```sh
docker save vibemost:latest | gzip | ssh user@server 'gunzip | docker load'
```

## Run

On the server, the repository checkout provides `compose.yaml` and holds `.env`. The first
time:

```sh
cd deploy/vibemost
cp .env.example .env    # then edit it
docker compose up -d --no-build
```

`--no-build` makes compose use the uploaded `vibemost:latest` image instead of building it.

## Update

1. On the development machine: pull the branch, then [build](#build) and [upload](#upload)
   the image as above.
2. On the server, in the repository checkout, pick up any changes to the compose file and
   restart the container with the new image:

   ```sh
   git pull --ff-only origin vibemost
   cd deploy/vibemost
   docker compose up -d --no-build
   ```

`--ff-only` stops instead of merging if the checkout has local commits or has drifted from
the branch. `.env` is ignored by git, so the pull leaves it alone.

## TLS

The container serves plain HTTP. Put a TLS reverse proxy in front of it, such as nginx,
Caddy or Traefik, and forward WebSocket upgrades. A minimal nginx example:

```nginx
server {
    listen 443 ssl;
    server_name vibemost.example.com;
    ssl_certificate     /etc/letsencrypt/live/vibemost.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vibemost.example.com/privkey.pem;
    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 600s;
    }
}
```

The container passes `X-Forwarded-Proto` on to Mattermost, which then marks session cookies
`Secure`.

## Limitations

- **Single sign-on doesn't work.** SSO/OAuth/SAML redirects go to the Mattermost server's
  SiteURL, not to Vibemost. Sign in with email or username and password.
- **Links in emails and push notifications** point to the SiteURL, so they open the stock client.
- **Mobile apps** are native and don't use this client. The Desktop app uses it when the
  Vibemost address is added as a server.
- **Version.** Build from the same Mattermost release as the server. The server reports its
  version in the `X-Version-Id` header of `/api/v4/system/ping`. After every server upgrade,
  rebase the changes onto the new tag and rebuild the image.

## Check

```sh
curl -s http://localhost:8080/vibemost/config.json                        # runtime settings
curl -sI http://localhost:8080/api/v4/system/ping | grep -i x-version-id  # Mattermost reached
docker logs vibemost | grep vibemost:                                     # settings in use
```

Then sign in, open a channel, and check that new messages arrive live, which needs the
WebSocket. Also check that the sidebar calendar loads.
