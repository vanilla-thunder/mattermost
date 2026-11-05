// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import classNames from 'classnames';
import React, {useEffect, useRef, useState} from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
import {useSelector} from 'react-redux';

import {CalendarOutlineIcon, ChevronDownIcon, ChevronRightIcon, CogOutlineIcon, VideoOutlineIcon} from '@mattermost/compass-icons/components';

import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import ExternalLink from 'components/external_link';
import Timestamp, {RelativeRanges} from 'components/timestamp';

import type {UpcomingEvent} from './caldav_client';
import type {MeetingLinkType} from './meeting_link';
import {loadCollapsed, loadSettings, removeSettings, saveCollapsed, saveSettings} from './settings_storage';
import type {CalendarSettings} from './settings_storage';
import ShareLinkForm from './share_link_form';
import {useUpcomingEvents} from './use_upcoming_events';

import './upcoming_events.scss';

/** How long an event stays in the list after it has started. All-day events stay until their last day ends. */
const SHOW_AFTER_START = 15 * 60 * 1000;

/** Windows at most this tall start with the panel collapsed, so the channel list keeps its space. */
export const SHORT_WINDOW_QUERY = '(max-height: 599px)';

function matchesShortWindow(): boolean {
    return typeof window.matchMedia === 'function' && window.matchMedia(SHORT_WINDOW_QUERY).matches;
}

function useIsShortWindow(): boolean {
    const [isShort, setIsShort] = useState(matchesShortWindow);
    useEffect(() => {
        if (typeof window.matchMedia !== 'function') {
            return undefined;
        }
        const query = window.matchMedia(SHORT_WINDOW_QUERY);
        const handleChange = () => setIsShort(query.matches);
        handleChange();
        query.addEventListener('change', handleChange);
        return () => query.removeEventListener('change', handleChange);
    }, []);
    return isShort;
}

const START_RANGES = [RelativeRanges.TODAY_TITLE_CASE, RelativeRanges.TOMORROW_TITLE_CASE];

/** Re-renders every minute, so started events switch to "Now". */
function useMinuteTick(): number {
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        const interval = window.setInterval(() => setNow(Date.now()), 60 * 1000);
        return () => window.clearInterval(interval);
    }, []);
    return now;
}

function EventItem({event, now}: {event: UpcomingEvent; now: number}) {
    const {formatMessage} = useIntl();
    const joinLabels: Record<MeetingLinkType, string> = {
        teams: formatMessage({id: 'nextcloud_calendar.join.teams', defaultMessage: 'Join Teams meeting'}),
        jitsi: formatMessage({id: 'nextcloud_calendar.join.jitsi', defaultMessage: 'Join Jitsi meeting'}),
    };
    const summary = event.summary || formatMessage({id: 'nextcloud_calendar.untitled', defaultMessage: 'Untitled event'});

    return (
        <li className='NextcloudCalendar__event'>
            <ExternalLink
                className='NextcloudCalendar__eventLink'
                href={event.calendarPageUrl}
                location='nextcloud_calendar_event'
                title={event.calendarName ? formatMessage({id: 'nextcloud_calendar.event.title', defaultMessage: '{summary} ({calendar})'}, {summary, calendar: event.calendarName}) : summary}
            >
                <span
                    className='NextcloudCalendar__eventColor'
                    style={event.color ? {backgroundColor: event.color} : undefined}
                />
                <span className='NextcloudCalendar__eventText'>
                    <span className='NextcloudCalendar__eventSummary'>{summary}</span>
                    <span className='NextcloudCalendar__eventStart'>
                        {event.isAllDay && event.start <= now && (
                            <FormattedMessage
                                id='nextcloud_calendar.all_day'
                                defaultMessage='All day'
                            />
                        )}
                        {event.isAllDay && event.start > now && (
                            <Timestamp
                                value={event.start}
                                ranges={START_RANGES}
                                useTime={false}
                                useSemanticOutput={false}
                            />
                        )}
                        {!event.isAllDay && event.start <= now && (
                            <FormattedMessage
                                id='nextcloud_calendar.now'
                                defaultMessage='Now'
                            />
                        )}
                        {!event.isAllDay && event.start > now && (
                            <Timestamp
                                value={event.start}
                                ranges={START_RANGES}
                                useSemanticOutput={false}
                            />
                        )}
                    </span>
                </span>
            </ExternalLink>
            {event.meetingLink && (
                <ExternalLink
                    className='NextcloudCalendar__join'
                    href={event.meetingLink.url}
                    location='nextcloud_calendar_join'
                    title={joinLabels[event.meetingLink.type]}
                    aria-label={joinLabels[event.meetingLink.type]}
                >
                    <VideoOutlineIcon size={18}/>
                </ExternalLink>
            )}
        </li>
    );
}

/** Today's and tomorrow's events from the user's Nextcloud calendars, at the bottom of the channel sidebar. */
export default function UpcomingEvents() {
    const {formatMessage} = useIntl();
    const userId = useSelector(getCurrentUserId);
    const [settings, setSettings] = useState<CalendarSettings | null>(() => loadSettings(userId));
    const share = settings?.share ?? null;
    const [editing, setEditing] = useState(false);
    const [collapsed, setCollapsed] = useState(() => loadCollapsed(userId));

    // Short windows always start collapsed; expanding there lasts until the window is resized
    const isShortWindow = useIsShortWindow();
    const [expandedInShortWindow, setExpandedInShortWindow] = useState(false);
    useEffect(() => {
        setExpandedInShortWindow(false);
    }, [isShortWindow]);
    const {events, loaded, error} = useUpcomingEvents(share);
    const now = useMinuteTick();

    // Events are sorted by start, so the limit keeps the soonest ones
    const visibleEvents = events.filter((event) => (event.isAllDay ? event.end > now : event.start > now - SHOW_AFTER_START)).slice(0, settings?.eventsLimit);

    // Reload the settings when another user logs in; the initial state already has the current user's
    const settingsUserId = useRef(userId);
    useEffect(() => {
        if (settingsUserId.current !== userId) {
            settingsUserId.current = userId;
            setSettings(loadSettings(userId));
            setCollapsed(loadCollapsed(userId));
            setEditing(false);
        }
    }, [userId]);

    // In a short window the toggle is temporary; otherwise the choice is remembered
    const toggleCollapsed = () => {
        if (isShortWindow) {
            setExpandedInShortWindow(!expandedInShortWindow);
            return;
        }
        saveCollapsed(userId, !collapsed);
        setCollapsed(!collapsed);
    };

    const handleSave = (newSettings: CalendarSettings) => {
        try {
            saveSettings(userId, newSettings);
        } catch (err) {
            // Storage blocked or full: the settings work until the page is reloaded
            // eslint-disable-next-line no-console
            console.error('Failed to store the Nextcloud calendar settings', err);
        }

        // Keep the same share object when only the limit changed, so the events are not fetched again
        const sameShare = share && share.serverUrl === newSettings.share.serverUrl && share.token === newSettings.share.token;
        setSettings(sameShare ? {...newSettings, share} : newSettings);
        setEditing(false);
    };

    const handleDisconnect = () => {
        removeSettings(userId);
        setSettings(null);
        setEditing(false);
    };

    // The settings form is shown even while collapsed
    const isCollapsed = (isShortWindow ? !expandedInShortWindow : collapsed) && Boolean(share) && !editing;

    let content;
    if (isCollapsed) {
        content = null;
    } else if (editing) {
        content = (
            <ShareLinkForm
                settings={settings}
                onSave={handleSave}
                onDisconnect={handleDisconnect}
                onCancel={() => setEditing(false)}
            />
        );
    } else if (!share) {
        content = (
            <button
                type='button'
                className='NextcloudCalendar__connect'
                onClick={() => setEditing(true)}
            >
                <CalendarOutlineIcon size={16}/>
                <FormattedMessage
                    id='nextcloud_calendar.connect'
                    defaultMessage='Connect Nextcloud calendar'
                />
            </button>
        );
    } else if (error === 'not_found') {
        content = (
            <p className='NextcloudCalendar__message NextcloudCalendar__message--error'>
                <FormattedMessage
                    id='nextcloud_calendar.error.not_found'
                    defaultMessage='The calendar link no longer works. Open the settings to update it.'
                />
            </p>
        );
    } else if (!loaded) {
        content = (
            <p className='NextcloudCalendar__message'>
                <FormattedMessage
                    id='nextcloud_calendar.loading'
                    defaultMessage='Loading events…'
                />
            </p>
        );
    } else if (error === 'connection' && visibleEvents.length === 0) {
        content = (
            <p className='NextcloudCalendar__message NextcloudCalendar__message--error'>
                <FormattedMessage
                    id='nextcloud_calendar.error.connection'
                    defaultMessage='Could not load events from Nextcloud.'
                />
            </p>
        );
    } else if (visibleEvents.length === 0) {
        content = (
            <p className='NextcloudCalendar__message'>
                <FormattedMessage
                    id='nextcloud_calendar.empty'
                    defaultMessage='No events planned'
                />
            </p>
        );
    } else {
        content = (
            <ul className='NextcloudCalendar__events'>
                {visibleEvents.map((event) => (
                    <EventItem
                        key={event.key}
                        event={event}
                        now={now}
                    />
                ))}
            </ul>
        );
    }

    const settingsLabel = formatMessage({id: 'nextcloud_calendar.settings', defaultMessage: 'Nextcloud calendar settings'});
    const title = (
        <FormattedMessage
            id='nextcloud_calendar.title'
            defaultMessage='Upcoming events'
        />
    );

    return (
        <div className={classNames('NextcloudCalendar', {'NextcloudCalendar--collapsed': isCollapsed})}>
            {(share || editing) && (
                <div className='NextcloudCalendar__header'>
                    <h2 className='NextcloudCalendar__title'>
                        {share && !editing ? (
                            <button
                                type='button'
                                className='NextcloudCalendar__toggle'
                                onClick={toggleCollapsed}
                                aria-expanded={!isCollapsed}
                            >
                                {isCollapsed ? <ChevronRightIcon size={16}/> : <ChevronDownIcon size={16}/>}
                                {title}
                                {isCollapsed && loaded && visibleEvents.length > 0 && (
                                    <span className='NextcloudCalendar__count'>{visibleEvents.length}</span>
                                )}
                            </button>
                        ) : title}
                    </h2>
                    {share && !editing && (
                        <button
                            type='button'
                            className='NextcloudCalendar__settings'
                            onClick={() => setEditing(true)}
                            title={settingsLabel}
                            aria-label={settingsLabel}
                        >
                            <CogOutlineIcon size={16}/>
                        </button>
                    )}
                </div>
            )}
            {content}
        </div>
    );
}
