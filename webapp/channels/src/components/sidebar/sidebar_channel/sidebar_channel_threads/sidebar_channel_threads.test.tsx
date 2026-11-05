// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import type {Post} from '@mattermost/types/posts';
import type {UserThread} from '@mattermost/types/threads';

import {selectPostById} from 'actions/views/rhs';

import {renderWithContext, screen, userEvent} from 'tests/react_testing_utils';

import SidebarChannelThreads from './sidebar_channel_threads';

jest.mock('actions/views/rhs', () => ({
    selectPostById: jest.fn(() => ({type: 'MOCK_SELECT_POST_BY_ID'})),
}));

function thread(id: string, overrides: Partial<UserThread> = {}): UserThread {
    return {
        id,
        reply_count: 1,
        last_reply_at: 1000,
        last_viewed_at: 0,
        participants: [],
        unread_replies: 0,
        unread_mentions: 0,
        is_following: true,
        post: {channel_id: 'channel', user_id: 'user'},
        ...overrides,
    };
}

function post(id: string, message: string): Partial<Post> {
    return {id, channel_id: 'channel', user_id: 'user', message, root_id: '', file_ids: []};
}

const initialState = {
    entities: {
        posts: {
            posts: {
                read: post('read', '**Release** planning for _v2_'),
                unread: post('unread', 'Deploy window'),
                empty: post('empty', ''),
            },
        },
        threads: {
            threads: {
                read: thread('read'),
                unread: thread('unread', {unread_replies: 3, unread_mentions: 2}),
                empty: thread('empty'),
            },
        },
    },
    views: {
        rhs: {isSidebarOpen: true, selectedPostId: 'read'},
    },
};

describe('SidebarChannelThreads', () => {
    test('shows the root messages as plain text with unread state and mentions', () => {
        renderWithContext(<SidebarChannelThreads threadIds={['unread', 'read', 'empty']}/>, initialState);

        const read = screen.getByRole('button', {name: 'Release planning for v2'});
        expect(read).not.toHaveClass('SidebarThread--unread');
        expect(read).toHaveClass('SidebarThread--active');

        const unread = screen.getByRole('button', {name: /Deploy window/});
        expect(unread).toHaveClass('SidebarThread--unread');
        expect(unread).not.toHaveClass('SidebarThread--active');
        expect(unread).toHaveTextContent('2');

        expect(screen.getByRole('button', {name: 'Thread'})).toBeInTheDocument();
    });

    test('opens the thread in the right-hand side', async () => {
        renderWithContext(<SidebarChannelThreads threadIds={['unread']}/>, initialState);

        await userEvent.click(screen.getByRole('button', {name: /Deploy window/}));

        expect(selectPostById).toHaveBeenCalledWith('unread');
    });
});
