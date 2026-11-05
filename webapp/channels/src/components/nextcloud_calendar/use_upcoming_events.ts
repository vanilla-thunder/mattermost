// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useCallback, useEffect, useRef, useState} from 'react';

import {CalendarShareNotFoundError, fetchUpcomingEvents} from './caldav_client';
import type {CalendarShare, UpcomingEvent} from './caldav_client';

/** How often to fetch the events again. */
const REFRESH_INTERVAL = 5 * 60 * 1000;

export type UpcomingEventsState = {
    events: UpcomingEvent[];

    /** False until the first fetch for the share has finished. */
    loaded: boolean;
    error: 'not_found' | 'connection' | null;
    refresh: () => void;
};

export function useUpcomingEvents(share: CalendarShare | null): UpcomingEventsState {
    const [events, setEvents] = useState<UpcomingEvent[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState<UpcomingEventsState['error']>(null);

    // Ignores responses of requests started for a previous share or superseded by a newer one
    const requestId = useRef(0);

    const refresh = useCallback(async () => {
        if (!share) {
            return;
        }

        const id = ++requestId.current;
        try {
            const result = await fetchUpcomingEvents(share);
            if (id === requestId.current) {
                setEvents(result);
                setError(null);
            }
        } catch (err) {
            if (id === requestId.current) {
                setError(err instanceof CalendarShareNotFoundError ? 'not_found' : 'connection');
                if (!(err instanceof CalendarShareNotFoundError)) {
                    // eslint-disable-next-line no-console
                    console.error('Failed to fetch Nextcloud calendar events', err);
                }
            }
        } finally {
            if (id === requestId.current) {
                setLoaded(true);
            }
        }
    }, [share]);

    useEffect(() => {
        setEvents([]);
        setLoaded(false);
        setError(null);
        if (!share) {
            return undefined;
        }

        refresh();
        const interval = window.setInterval(refresh, REFRESH_INTERVAL);
        const ids = requestId;
        return () => {
            window.clearInterval(interval);

            // Drop the response of a request still running for this share
            ids.current++;
        };
    }, [share, refresh]);

    return {events, loaded, error, refresh};
}
