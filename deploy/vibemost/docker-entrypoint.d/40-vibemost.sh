#!/bin/sh
# Vibemost: render the nginx config and the client's runtime config (/vibemost/config.json)
# from environment variables. Run by the nginx image's entrypoint before nginx starts.
# Every value is checked against a strict pattern before it goes into a config file.
set -eu

fail() {
    echo "vibemost: $*" >&2
    exit 1
}

# scheme://host[:port], optionally followed by a path
URL_PATTERN='^https?://[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9._~/-]*)?$'
HOST_PATTERN='^[A-Za-z0-9.-]+$'
SIZE_PATTERN='^[0-9]+[kKmMgG]?$'

# Split a checked URL into ORIGIN (scheme://host[:port]), HOST (host[:port]) and SNI (host).
split_url() {
    origin=$(printf '%s' "$1" | sed -E 's#^(https?://[^/]+).*$#\1#')
    host=${origin#*://}
    sni=${host%%:*}
}

# ---- Mattermost -------------------------------------------------------------------
[ -n "${VIBEMOST_MATTERMOST_URL:-}" ] ||
    fail "VIBEMOST_MATTERMOST_URL is required, e.g. https://chat.example.com"
printf '%s' "$VIBEMOST_MATTERMOST_URL" | grep -Eq "$URL_PATTERN" ||
    fail "VIBEMOST_MATTERMOST_URL is not a URL like https://chat.example.com: $VIBEMOST_MATTERMOST_URL"
split_url "$VIBEMOST_MATTERMOST_URL"
MATTERMOST_ORIGIN=$origin MATTERMOST_HOST=$host MATTERMOST_SNI=$sni

VIBEMOST_MAX_BODY_SIZE=${VIBEMOST_MAX_BODY_SIZE:-100m}
printf '%s' "$VIBEMOST_MAX_BODY_SIZE" | grep -Eq "$SIZE_PATTERN" ||
    fail "VIBEMOST_MAX_BODY_SIZE is not a size like 100m: $VIBEMOST_MAX_BODY_SIZE"

# DNS servers for nginx's runtime lookups: the container's own (Docker's embedded DNS on
# user-defined networks). IPv6 addresses need brackets.
VIBEMOST_RESOLVER=$(awk '/^nameserver/ { print ($2 ~ /:/ ? "[" $2 "]" : $2) }' /etc/resolv.conf | tr '\n' ' ')
[ -n "${VIBEMOST_RESOLVER% }" ] || fail "no nameserver in /etc/resolv.conf"

export MATTERMOST_ORIGIN MATTERMOST_HOST MATTERMOST_SNI VIBEMOST_MAX_BODY_SIZE VIBEMOST_RESOLVER

# ---- Nextcloud (optional) ---------------------------------------------------------
mkdir -p /etc/nginx/vibemost
NEXTCLOUD_ORIGIN=
if [ -n "${VIBEMOST_NEXTCLOUD_URL:-}" ]; then
    printf '%s' "$VIBEMOST_NEXTCLOUD_URL" | grep -Eq "$URL_PATTERN" ||
        fail "VIBEMOST_NEXTCLOUD_URL is not a URL like https://cloud.example.com: $VIBEMOST_NEXTCLOUD_URL"
    split_url "$VIBEMOST_NEXTCLOUD_URL"
    NEXTCLOUD_ORIGIN=$origin NEXTCLOUD_HOST=$host NEXTCLOUD_SNI=$sni
    export NEXTCLOUD_ORIGIN NEXTCLOUD_HOST NEXTCLOUD_SNI
    envsubst '${NEXTCLOUD_ORIGIN} ${NEXTCLOUD_HOST} ${NEXTCLOUD_SNI}' \
        < /etc/vibemost/nextcloud.conf.template > /etc/nginx/vibemost/nextcloud.conf
else
    echo '# VIBEMOST_NEXTCLOUD_URL is not set: no Nextcloud proxy.' > /etc/nginx/vibemost/nextcloud.conf
fi

# ---- Jitsi (optional) -------------------------------------------------------------
JITSI_HOSTS_JSON=
for jitsi_host in $(printf '%s' "${VIBEMOST_JITSI_HOSTS:-}" | tr ',' ' '); do
    printf '%s' "$jitsi_host" | grep -Eq "$HOST_PATTERN" ||
        fail "VIBEMOST_JITSI_HOSTS must be comma-separated host names, got: $jitsi_host"
    JITSI_HOSTS_JSON="${JITSI_HOSTS_JSON:+$JITSI_HOSTS_JSON, }\"$jitsi_host\""
done

# ---- Render -----------------------------------------------------------------------
envsubst '${MATTERMOST_ORIGIN} ${MATTERMOST_HOST} ${MATTERMOST_SNI} ${VIBEMOST_MAX_BODY_SIZE} ${VIBEMOST_RESOLVER}' \
    < /etc/vibemost/vibemost.conf.template > /etc/nginx/conf.d/vibemost.conf

mkdir -p /usr/share/nginx/vibemost-runtime
printf '{"nextcloudUrl": "%s", "jitsiHosts": [%s]}\n' "$NEXTCLOUD_ORIGIN" "$JITSI_HOSTS_JSON" \
    > /usr/share/nginx/vibemost-runtime/config.json

echo "vibemost: Mattermost $MATTERMOST_ORIGIN, Nextcloud ${NEXTCLOUD_ORIGIN:-none}, Jitsi hosts: ${VIBEMOST_JITSI_HOSTS:-none}"
