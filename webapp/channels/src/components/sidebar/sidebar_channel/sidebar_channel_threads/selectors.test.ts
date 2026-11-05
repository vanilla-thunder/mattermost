// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {CollapsedThreads} from '@mattermost/types/config';
import type {UserThread} from '@mattermost/types/threads';
import type {DeepPartial} from '@mattermost/types/utilities';

import type {GlobalState} from 'types/store';

import {getSidebarThreadIds, MAX_THREAD_AGE} from './selectors';

const NOW = new Date('2026-11-03T12:30:00Z').getTime();

function thread(id: string, channelId: string, overrides: Partial<UserThread> = {}): UserThread {
    return {
        id,
        reply_count: 1,
        last_reply_at: NOW - 1000,
        last_viewed_at: 0,
        participants: [],
        unread_replies: 0,
        unread_mentions: 0,
        is_following: true,
        post: {channel_id: channelId, user_id: 'user'},
        ...overrides,
    };
}

function makeState(threads: UserThread[], collapsedThreads = CollapsedThreads.ALWAYS_ON): GlobalState {
    const state: DeepPartial<GlobalState> = {
        entities: {
            general: {config: {CollapsedThreads: collapsedThreads}},
            preferences: {myPreferences: {}},
            threads: {threads: Object.fromEntries(threads.map((t) => [t.id, t]))},
        },
    };
    return state as GlobalState;
}

describe('getSidebarThreadIds', () => {
    beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(NOW);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('lists unread threads first, then by latest reply, at most three', () => {
        const state = makeState([
            thread('old', 'channel', {last_reply_at: NOW - 100}),
            thread('newest', 'channel', {last_reply_at: NOW - 50}),
            thread('newer', 'channel', {last_reply_at: NOW - 60}),
            thread('unread', 'channel', {last_reply_at: NOW - 500, unread_replies: 2}),
            thread('mention', 'channel', {last_reply_at: NOW - 400, unread_mentions: 1}),
        ]);

        expect(getSidebarThreadIds(state, 'channel')).toEqual(['mention', 'unread', 'newest']);
    });

    test('leaves out unfollowed threads, threads without replies and other channels', () => {
        const state = makeState([
            thread('followed', 'channel'),
            thread('unfollowed', 'channel', {is_following: false}),
            thread('no_replies', 'channel', {last_reply_at: 0}),
            thread('elsewhere', 'other_channel'),
        ]);

        expect(getSidebarThreadIds(state, 'channel')).toEqual(['followed']);
        expect(getSidebarThreadIds(state, 'empty_channel')).toEqual([]);
    });

    test('leaves out threads without a reply in the last three weeks, even unread ones', () => {
        const state = makeState([
            thread('recent', 'channel', {last_reply_at: (NOW - MAX_THREAD_AGE) + (60 * 60 * 1000)}),
            thread('stale', 'channel', {last_reply_at: NOW - MAX_THREAD_AGE - (60 * 60 * 1000)}),
            thread('stale_unread', 'channel', {last_reply_at: NOW - MAX_THREAD_AGE - (60 * 60 * 1000), unread_replies: 1}),
        ]);

        expect(getSidebarThreadIds(state, 'channel')).toEqual(['recent']);
    });

    test('is empty when collapsed reply threads are disabled', () => {
        const state = makeState([thread('followed', 'channel')], CollapsedThreads.DISABLED);

        expect(getSidebarThreadIds(state, 'channel')).toEqual([]);
    });
});
