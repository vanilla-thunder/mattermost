// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import matchMedia from 'tests/helpers/match_media.mock';
import {renderWithContext, screen, userEvent} from 'tests/react_testing_utils';

import {CalendarShareNotFoundError, fetchCalendar, fetchUpcomingEvents} from './caldav_client';
import type {UpcomingEvent} from './caldav_client';
import UpcomingEvents, {SHORT_WINDOW_QUERY} from './upcoming_events';

jest.mock('./caldav_client', () => ({
    ...jest.requireActual('./caldav_client'),
    fetchUpcomingEvents: jest.fn(),
    fetchCalendar: jest.fn(),
}));

const mockFetchUpcomingEvents = fetchUpcomingEvents as jest.MockedFunction<typeof fetchUpcomingEvents>;

const state = {
    entities: {
        users: {currentUserId: 'user_id', profiles: {user_id: {id: 'user_id'}}},
    },
};

const STORAGE_KEY = 'vibemost_nextcloud_calendar_user_id';
const SHARE = {serverUrl: 'https://cloud.example.com', token: 'AbC123'};

function upcomingEvent(props: Partial<UpcomingEvent>): UpcomingEvent {
    const start = props.start ?? Date.now() + (60 * 60 * 1000);
    return {
        key: 'key',
        summary: 'Event',
        start,
        end: start + (30 * 60 * 1000),
        isAllDay: false,
        isRecurring: false,
        calendarName: 'Personal',
        color: '#0082c9',
        calendarPageUrl: 'https://cloud.example.com/apps/calendar/p/AbC123/timeGridDay/2026-11-03',
        meetingLink: null,
        ...props,
    };
}

describe('components/nextcloud_calendar/upcoming_events', () => {
    beforeEach(() => {
        localStorage.clear();
        mockFetchUpcomingEvents.mockReset();
        matchMedia.clear();
    });

    test('offers to connect when no account is stored', async () => {
        renderWithContext(<UpcomingEvents/>, state);

        await userEvent.click(screen.getByRole('button', {name: 'Connect Nextcloud calendar'}));

        expect(screen.getByRole('textbox', {name: 'Public calendar link'})).toBeInTheDocument();
        expect(mockFetchUpcomingEvents).not.toHaveBeenCalled();
    });

    test('lists the three soonest events with join links', async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(SHARE));
        mockFetchUpcomingEvents.mockResolvedValue([
            upcomingEvent({key: '1', summary: 'Standup', start: Date.now() - 1000, meetingLink: {type: 'teams', url: 'https://teams.microsoft.com/l/meetup-join/abc'}}),
            upcomingEvent({key: '2', summary: 'Review', meetingLink: {type: 'jitsi', url: 'https://meet.example.com/Review'}}),
            upcomingEvent({key: '3', summary: 'Lunch'}),
            upcomingEvent({key: '4', summary: 'Too late'}),
        ]);

        renderWithContext(<UpcomingEvents/>, state);

        expect(await screen.findByText('Standup')).toBeInTheDocument();
        expect(screen.getByText('Now')).toBeInTheDocument();
        expect(screen.getByText('Review')).toBeInTheDocument();
        expect(screen.getByText('Lunch')).toBeInTheDocument();
        expect(screen.queryByText('Too late')).not.toBeInTheDocument();
        expect(screen.getByRole('link', {name: 'Join Teams meeting'})).toHaveAttribute('href', 'https://teams.microsoft.com/l/meetup-join/abc');
        expect(screen.getByRole('link', {name: 'Join Jitsi meeting'})).toHaveAttribute('href', 'https://meet.example.com/Review');
        expect(mockFetchUpcomingEvents).toHaveBeenCalledWith(SHARE);
    });

    test('hides timed events 15 minutes after they started, and all-day events when their last day is over', async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(SHARE));
        mockFetchUpcomingEvents.mockResolvedValue([
            upcomingEvent({key: '1', summary: 'Started 20 minutes ago', start: Date.now() - (20 * 60 * 1000)}),
            upcomingEvent({key: '2', summary: 'Started 10 minutes ago', start: Date.now() - (10 * 60 * 1000)}),
            upcomingEvent({key: '3', summary: 'Later'}),
            upcomingEvent({key: '4', summary: 'Holiday', start: Date.now() - (5 * 60 * 60 * 1000), end: Date.now() + (60 * 60 * 1000), isAllDay: true}),

            // Yesterday's all-day event, still returned by Nextcloud shortly after midnight
            upcomingEvent({key: '5', summary: 'Yesterday', start: Date.now() - (24 * 60 * 60 * 1000), end: Date.now() - (7 * 60 * 1000), isAllDay: true}),
        ]);

        renderWithContext(<UpcomingEvents/>, state);

        expect(await screen.findByText('Started 10 minutes ago')).toBeInTheDocument();
        expect(screen.getByText('Holiday')).toBeInTheDocument();
        expect(screen.getByText('All day')).toBeInTheDocument();
        expect(screen.getByText('Later')).toBeInTheDocument();
        expect(screen.queryByText('Started 20 minutes ago')).not.toBeInTheDocument();
        expect(screen.queryByText('Yesterday')).not.toBeInTheDocument();
    });

    test('shows as many events as configured and saves a new limit', async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({...SHARE, eventsLimit: 4}));
        const summaries = ['One', 'Two', 'Three', 'Four', 'Five'];
        mockFetchUpcomingEvents.mockResolvedValue(summaries.map((summary, i) => upcomingEvent({key: String(i), summary, start: Date.now() + ((i + 1) * 60 * 60 * 1000)})));
        (fetchCalendar as jest.MockedFunction<typeof fetchCalendar>).mockResolvedValue({displayName: null, color: null});

        renderWithContext(<UpcomingEvents/>, state);

        expect(await screen.findByText('Four')).toBeInTheDocument();
        expect(screen.queryByText('Five')).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', {name: 'Nextcloud calendar settings'}));
        await userEvent.selectOptions(screen.getByRole('combobox', {name: 'Events to show'}), '2');
        await userEvent.click(screen.getByRole('button', {name: 'Save'}));

        expect(await screen.findByText('Two')).toBeInTheDocument();
        expect(screen.queryByText('Three')).not.toBeInTheDocument();
        expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({...SHARE, eventsLimit: 2});

        // Only the limit changed, so the events were not fetched again
        expect(mockFetchUpcomingEvents).toHaveBeenCalledTimes(1);
    });

    test('collapses to the header with the number of events and remembers it', async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(SHARE));
        mockFetchUpcomingEvents.mockResolvedValue([
            upcomingEvent({key: '1', summary: 'Standup'}),
            upcomingEvent({key: '2', summary: 'Review'}),
        ]);

        const {unmount} = renderWithContext(<UpcomingEvents/>, state);
        expect(await screen.findByText('Standup')).toBeInTheDocument();

        const toggle = screen.getByRole('button', {name: 'Upcoming events'});
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        await userEvent.click(toggle);

        expect(screen.queryByText('Standup')).not.toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Upcoming events 2'})).toHaveAttribute('aria-expanded', 'false');
        expect(localStorage.getItem('vibemost_nextcloud_calendar_collapsed_user_id')).toBe('true');

        // Still collapsed after a reload
        unmount();
        renderWithContext(<UpcomingEvents/>, state);
        expect(await screen.findByRole('button', {name: 'Upcoming events 2'})).toBeInTheDocument();
        expect(screen.queryByText('Standup')).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', {name: 'Upcoming events 2'}));
        expect(screen.getByText('Standup')).toBeInTheDocument();
        expect(localStorage.getItem('vibemost_nextcloud_calendar_collapsed_user_id')).toBeNull();
    });

    test('starts collapsed in short windows without changing the remembered choice', async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(SHARE));
        mockFetchUpcomingEvents.mockResolvedValue([upcomingEvent({key: '1', summary: 'Standup'})]);
        matchMedia.useMediaQuery(SHORT_WINDOW_QUERY);

        renderWithContext(<UpcomingEvents/>, state);

        const toggle = await screen.findByRole('button', {name: 'Upcoming events 1'});
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByText('Standup')).not.toBeInTheDocument();

        await userEvent.click(toggle);
        expect(screen.getByText('Standup')).toBeInTheDocument();
        expect(localStorage.getItem('vibemost_nextcloud_calendar_collapsed_user_id')).toBeNull();
    });

    test('asks to update a link that no longer works', async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(SHARE));
        mockFetchUpcomingEvents.mockRejectedValue(new CalendarShareNotFoundError());

        renderWithContext(<UpcomingEvents/>, state);

        expect(await screen.findByText('The calendar link no longer works. Open the settings to update it.')).toBeInTheDocument();
    });
});
