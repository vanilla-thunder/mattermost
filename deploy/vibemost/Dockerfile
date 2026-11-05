# syntax=docker/dockerfile:1
#
# Vibemost web client, served by nginx in front of an existing Mattermost server.
# Build from the repository root:
#   docker build -f deploy/vibemost/Dockerfile -t vibemost .
# Configuration comes from environment variables at runtime, see .env.example.

FROM node:24-bookworm AS build
WORKDIR /src/webapp

COPY webapp/ ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
RUN npm run build && find channels/dist -name '*.map' -delete

FROM nginx:1.27-alpine

COPY --from=build /src/webapp/channels/dist /usr/share/nginx/vibemost/static
COPY deploy/vibemost/nginx/ /etc/vibemost/
COPY --chmod=755 deploy/vibemost/docker-entrypoint.d/40-vibemost.sh /docker-entrypoint.d/
RUN rm /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s CMD wget -q -O /dev/null http://127.0.0.1/vibemost/config.json || exit 1
