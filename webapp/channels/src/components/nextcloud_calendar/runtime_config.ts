// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * Vibemost settings for the calendar integration. They are read at runtime from a JSON file
 * on the host that serves the web client, so one build works for any deployment. The file
 * is generated from environment variables by the webpack dev server in development and by
 * the container entrypoint in production (see deploy/vibemost).
 */
export type RuntimeConfig = {

    /** Origin of the Nextcloud server reached through the same-origin proxy, if any. */
    nextcloudOrigin: string | null;

    /** Jitsi servers whose links count as meeting links, in lower case. */
    jitsiHosts: string[];
};

export const RUNTIME_CONFIG_PATH = '/vibemost/config.json';

/** Path prefix of the same-origin Nextcloud proxy. */
export const NEXTCLOUD_PROXY_PATH = '/vibemost-nextcloud';

const EMPTY_CONFIG: RuntimeConfig = {nextcloudOrigin: null, jitsiHosts: []};

/** Validate the JSON file's contents. Unusable values are dropped instead of failing. */
export function parseRuntimeConfig(data: unknown): RuntimeConfig {
    const raw = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;

    let nextcloudOrigin: string | null = null;
    if (typeof raw.nextcloudUrl === 'string' && raw.nextcloudUrl.trim()) {
        try {
            const url = new URL(raw.nextcloudUrl.trim());
            if (url.protocol === 'https:' || url.protocol === 'http:') {
                nextcloudOrigin = url.origin;
            }
        } catch {
            // Not a URL
        }
    }

    const jitsiHosts = Array.isArray(raw.jitsiHosts) ? raw.jitsiHosts.
        filter((host): host is string => typeof host === 'string').
        map((host) => host.trim().toLowerCase()).
        filter(Boolean) : [];

    return {nextcloudOrigin, jitsiHosts};
}

let loading: Promise<RuntimeConfig> | null = null;

/**
 * Load the runtime config once. If it can't be loaded, the calendar still works with direct
 * requests and without Jitsi detection, and the next call tries again.
 */
export function loadRuntimeConfig(): Promise<RuntimeConfig> {
    if (!loading) {
        loading = fetch(RUNTIME_CONFIG_PATH, {credentials: 'omit', cache: 'no-cache'}).
            then(async (response) => {
                if (!response.ok) {
                    throw new Error(`GET ${RUNTIME_CONFIG_PATH} failed with HTTP ${response.status}`);
                }
                return parseRuntimeConfig(await response.json());
            }).
            catch(() => {
                loading = null;
                return EMPTY_CONFIG;
            });
    }
    return loading;
}

export function resetRuntimeConfigForTesting() {
    loading = null;
}
