// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useEffect} from 'react';
import {useDispatch, useSelector} from 'react-redux';

import {getThreadsForCurrentTeam} from 'mattermost-redux/actions/threads';
import {isCollapsedThreadsEnabled} from 'mattermost-redux/selectors/entities/preferences';
import {getCurrentTeamId} from 'mattermost-redux/selectors/entities/teams';

/**
 * Loads the followed threads of the current team, so they can be listed below their channels.
 * The web app only loads threads when the Threads view opens; afterwards WebSocket events
 * keep them up to date.
 */
export default function FollowedThreadsLoader() {
    const dispatch = useDispatch();
    const teamId = useSelector(getCurrentTeamId);
    const crtEnabled = useSelector(isCollapsedThreadsEnabled);

    useEffect(() => {
        if (!crtEnabled || !teamId) {
            return;
        }

        // Latest followed threads, plus unread ones that may be older
        dispatch(getThreadsForCurrentTeam({unread: false}));
        dispatch(getThreadsForCurrentTeam({unread: true}));
    }, [dispatch, crtEnabled, teamId]);

    return null;
}
