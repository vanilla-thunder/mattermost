// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import classNames from 'classnames';
import React, {useMemo} from 'react';
import {useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';

import {MessageTextOutlineIcon} from '@mattermost/compass-icons/components';
import type {UserThread} from '@mattermost/types/threads';

import {Posts} from 'mattermost-redux/constants';
import {getPost} from 'mattermost-redux/selectors/entities/posts';
import {getThread} from 'mattermost-redux/selectors/entities/threads';

import {selectPostById} from 'actions/views/rhs';
import {getIsRhsOpen, getSelectedPostId} from 'selectors/rhs';

import ChannelMentionBadge from 'components/sidebar/sidebar_channel/channel_mention_badge';

import {stripMarkdown} from 'utils/markdown';

import type {GlobalState} from 'types/store';

import './sidebar_channel_threads.scss';

function SidebarThread({threadId}: {threadId: UserThread['id']}) {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();
    const thread = useSelector((state: GlobalState) => getThread(state, threadId));
    const post = useSelector((state: GlobalState) => getPost(state, threadId));
    const isActive = useSelector((state: GlobalState) => getIsRhsOpen(state) && getSelectedPostId(state) === threadId);

    const label = useMemo(() => {
        if (post?.state === Posts.POST_DELETED) {
            return formatMessage({id: 'post_body.deleted', defaultMessage: '(message deleted)'});
        }
        const text = post?.message ? stripMarkdown(post.message).replace(/\s+/g, ' ') : '';
        if (text) {
            return text;
        }
        if (post?.file_ids?.length) {
            return formatMessage({id: 'sidebar.followed_threads.attachment', defaultMessage: 'Attachment'});
        }
        return formatMessage({id: 'sidebar.followed_threads.untitled', defaultMessage: 'Thread'});
    }, [post?.message, post?.state, post?.file_ids?.length, formatMessage]);

    if (!thread) {
        return null;
    }

    const isUnread = thread.unread_replies > 0 || thread.unread_mentions > 0;

    return (
        <li className='SidebarChannelThreads__item'>
            <button
                type='button'
                className={classNames('SidebarThread', {
                    'SidebarThread--unread': isUnread,
                    'SidebarThread--active': isActive,
                })}
                onClick={() => dispatch(selectPostById(threadId))}
                title={label}
                aria-current={isActive || undefined}
            >
                <MessageTextOutlineIcon
                    className='SidebarThread__icon'
                    size={14}
                />
                <span className='SidebarThread__label'>{label}</span>
                <ChannelMentionBadge
                    unreadMentions={thread.unread_mentions}
                    hasUrgent={thread.is_urgent}
                    className='SidebarThread__badge'
                />
            </button>
        </li>
    );
}

type Props = {
    threadIds: Array<UserThread['id']>;
};

/** Followed threads listed below their channel in the sidebar. Opens a thread in the right-hand side. */
export default function SidebarChannelThreads({threadIds}: Props) {
    const {formatMessage} = useIntl();

    return (
        <ul
            className='SidebarChannelThreads'
            aria-label={formatMessage({id: 'sidebar.followed_threads.label', defaultMessage: 'Followed threads'})}
        >
            {threadIds.map((threadId) => (
                <SidebarThread
                    key={threadId}
                    threadId={threadId}
                />
            ))}
        </ul>
    );
}
