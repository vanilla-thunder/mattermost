// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {loadRuntimeConfig, parseRuntimeConfig, resetRuntimeConfigForTesting, RUNTIME_CONFIG_PATH} from './runtime_config';

describe('parseRuntimeConfig', () => {
    test('reads the Nextcloud origin and Jitsi hosts', () => {
        expect(parseRuntimeConfig({
            nextcloudUrl: ' https://cloud.example.com/nextcloud/ ',
            jitsiHosts: [' Meet.Example.com ', 'jitsi.example.org', ''],
        })).toEqual({
            nextcloudOrigin: 'https://cloud.example.com',
            jitsiHosts: ['meet.example.com', 'jitsi.example.org'],
        });
    });

    test('drops unusable values', () => {
        const empty = {nextcloudOrigin: null, jitsiHosts: []};
        expect(parseRuntimeConfig(null)).toEqual(empty);
        expect(parseRuntimeConfig('text')).toEqual(empty);
        expect(parseRuntimeConfig({nextcloudUrl: '', jitsiHosts: 'meet.example.com'})).toEqual(empty);
        expect(parseRuntimeConfig({nextcloudUrl: 'not a url'})).toEqual(empty);
        expect(parseRuntimeConfig({nextcloudUrl: 'javascript:alert(1)'})).toEqual(empty); // eslint-disable-line no-script-url
        expect(parseRuntimeConfig({jitsiHosts: [42, null]})).toEqual(empty);
    });
});

describe('loadRuntimeConfig', () => {
    const originalFetch = global.fetch;
    let fetchMock: jest.Mock;

    beforeEach(() => {
        resetRuntimeConfigForTesting();
        fetchMock = jest.fn();
        global.fetch = fetchMock;
    });

    afterAll(() => {
        global.fetch = originalFetch;
        resetRuntimeConfigForTesting();
    });

    test('fetches the config file once', async () => {
        fetchMock.mockResolvedValue({ok: true, json: async () => ({nextcloudUrl: 'https://cloud.example.com', jitsiHosts: ['meet.example.com']})});

        const expected = {nextcloudOrigin: 'https://cloud.example.com', jitsiHosts: ['meet.example.com']};
        await expect(loadRuntimeConfig()).resolves.toEqual(expected);
        await expect(loadRuntimeConfig()).resolves.toEqual(expected);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(RUNTIME_CONFIG_PATH, expect.objectContaining({credentials: 'omit'}));
    });

    test('falls back to an empty config and retries on the next call', async () => {
        fetchMock.mockResolvedValueOnce({ok: false, status: 404});
        await expect(loadRuntimeConfig()).resolves.toEqual({nextcloudOrigin: null, jitsiHosts: []});

        fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        await expect(loadRuntimeConfig()).resolves.toEqual({nextcloudOrigin: null, jitsiHosts: []});

        fetchMock.mockResolvedValueOnce({ok: true, json: async () => ({jitsiHosts: ['meet.example.com']})});
        await expect(loadRuntimeConfig()).resolves.toEqual({nextcloudOrigin: null, jitsiHosts: ['meet.example.com']});

        expect(fetchMock).toHaveBeenCalledTimes(3);
    });
});
