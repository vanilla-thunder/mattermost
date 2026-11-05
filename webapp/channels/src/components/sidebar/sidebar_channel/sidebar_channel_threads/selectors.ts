// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Channel} from '@mattermost/types/channels';
import type {UserThread} from '@mattermost/types/threads';

import {createSelector} from 'mattermost-redux/selectors/create_selector';
import {isCollapsedThreadsEnabled} from 'mattermost-redux/selectors/entities/preferences';
import {getThreads} from 'mattermost-redux/selectors/entities/threads';

import type {GlobalState} from 'types/store';

/** Maximum number of followed threads shown below a channel in the sidebar. */
export const MAX_THREADS_PER_CHANNEL = 3;

/** Only threads with a reply within this period are shown. */
export const MAX_THREAD_AGE = 21 * 24 * 60 * 60 * 1000;

const HOUR = 60 * 60 * 1000;

const NO_THREADS: Array<UserThread['id']> = [];

function isUnreadThread(thread: UserThread): boolean {
    return thread.unread_replies > 0 || thread.unread_mentions > 0;
}

/**
 * Current time rounded down to the hour, so the age cutoff below is recomputed at most hourly
 * and threads still drop out when no thread changes.
 */
function getCurrentHour(): number {
    return Math.floor(Date.now() / HOUR) * HOUR;
}

/**
 * Followed threads per channel, unread ones first, then by latest reply. Threads without
 * replies (like in the Threads view) or without a reply in the last three weeks are left out.
 */
export const getSidebarThreadIdsByChannel: (state: GlobalState) => Record<Channel['id'], Array<UserThread['id']>> = createSelector(
    'getSidebarThreadIdsByChannel',
    getThreads,
    getCurrentHour,
    (threads, currentHour) => {
        const minLastReplyAt = currentHour - MAX_THREAD_AGE;
        const threadsByChannel: Record<Channel['id'], UserThread[]> = {};
        for (const thread of Object.values(threads)) {
            const channelId = thread?.post?.channel_id;
            if (!channelId || !thread.is_following || thread.last_reply_at < minLastReplyAt) {
                continue;
            }
            (threadsByChannel[channelId] ??= []).push(thread);
        }

        const result: Record<Channel['id'], Array<UserThread['id']>> = {};
        for (const [channelId, channelThreads] of Object.entries(threadsByChannel)) {
            channelThreads.sort((a, b) => (Number(isUnreadThread(b)) - Number(isUnreadThread(a))) || (b.last_reply_at - a.last_reply_at));
            result[channelId] = channelThreads.slice(0, MAX_THREADS_PER_CHANNEL).map((thread) => thread.id);
        }
        return result;
    },
);

/** Thread IDs to show below the channel in the sidebar. Empty unless collapsed reply threads are on. */
export function getSidebarThreadIds(state: GlobalState, channelId: Channel['id']): Array<UserThread['id']> {
    if (!isCollapsedThreadsEnabled(state)) {
        return NO_THREADS;
    }
    return getSidebarThreadIdsByChannel(state)[channelId] ?? NO_THREADS;
}
