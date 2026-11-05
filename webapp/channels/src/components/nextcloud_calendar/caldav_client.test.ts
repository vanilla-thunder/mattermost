// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {parseMultistatus, parseShareLink, shareLinkOf, toCalendar, toRequestUrl, toUpcomingEvents} from './caldav_client';

const SERVER = 'https://cloud.example.com';
const share = {serverUrl: SERVER, token: 'AbC123xyz'};

describe('parseShareLink', () => {
    test.each([
        ['https://cloud.example.com/apps/calendar/p/AbC123xyz', share],
        ['  https://cloud.example.com/index.php/apps/calendar/p/AbC123xyz/timeGridDay/2026-11-04  ', share],
        ['https://cloud.example.com/apps/calendar/embed/AbC123xyz', share],
        ['https://cloud.example.com/remote.php/dav/public-calendars/AbC123xyz/?export', share],
        ['https://example.com/nextcloud/apps/calendar/p/AbC123xyz', {serverUrl: 'https://example.com/nextcloud', token: 'AbC123xyz'}],
        ['http://localhost:8080/apps/calendar/p/AbC123xyz', {serverUrl: 'http://localhost:8080', token: 'AbC123xyz'}],
    ])('accepts %p', (input, expected) => {
        expect(parseShareLink(input)).toEqual(expected);
    });

    test.each([
        [''],
        ['cloud.example.com/apps/calendar/p/AbC123xyz'],
        ['http://cloud.example.com/apps/calendar/p/AbC123xyz'],
        ['https://user:pass@cloud.example.com/apps/calendar/p/AbC123xyz'],
        ['https://cloud.example.com/apps/calendar/'],
        ['https://cloud.example.com/apps/calendar/p/'],
        ['https://cloud.example.com/remote.php/dav/calendars/alice/personal/'],
    ])('rejects %p', (input) => {
        expect(parseShareLink(input)).toBeNull();
    });

    test('round-trips through shareLinkOf', () => {
        expect(parseShareLink(shareLinkOf(share))).toEqual(share);
    });
});

describe('toCalendar', () => {
    test('reads name and color without alpha', () => {
        const xml = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:x1="http://apple.com/ns/ical/">
  <d:response>
    <d:href>/remote.php/dav/public-calendars/AbC123xyz/</d:href>
    <d:propstat><d:prop><d:displayname>Personal (alice)</d:displayname><x1:calendar-color>#2EAC4CFF</x1:calendar-color></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
  </d:response>
</d:multistatus>`;
        expect(toCalendar(xml, SERVER)).toEqual({displayName: 'Personal (alice)', color: '#2EAC4C'});
    });

    test('rejects invalid XML', () => {
        expect(() => parseMultistatus('<d:multistatus', SERVER)).toThrow();
    });
});

const ics = (...lines: string[]) => lines.join('\r\n');

const CALENDAR_QUERY = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:href>/remote.php/dav/public-calendars/AbC123xyz/standup.ics</d:href>
    <d:propstat><d:prop><cal:calendar-data>${ics(
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:standup',
        'SUMMARY:Standup &amp; planning',
        'DTSTART:20261103T090000Z',
        'RECURRENCE-ID:20261103T090000Z',
        'DESCRIPTION:Jitsi: https://meet.example.com/Standup\\nTeams: https://teams.microsoft.com/l/meetup-join/abc',
        'END:VEVENT',
        'END:VCALENDAR',
    )}</cal:calendar-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/public-calendars/AbC123xyz/cancelled.ics</d:href>
    <d:propstat><d:prop><cal:calendar-data>${ics(
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'DTSTART:20261103T100000Z',
        'STATUS:CANCELLED',
        'END:VEVENT',
        'END:VCALENDAR',
    )}</cal:calendar-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
  </d:response>
</d:multistatus>`;

describe('toUpcomingEvents', () => {
    test('maps occurrences and skips cancelled events', () => {
        const calendar = {displayName: 'Personal', color: '#0082C9'};
        const start = Date.UTC(2026, 10, 3, 9);

        expect(toUpcomingEvents(share, calendar, CALENDAR_QUERY, ['meet.example.com'])).toEqual([{
            key: `/remote.php/dav/public-calendars/AbC123xyz/standup.ics#${start}`,
            summary: 'Standup & planning',
            start,
            end: start,
            isAllDay: false,
            isRecurring: true,
            calendarName: 'Personal',
            color: '#0082C9',
            calendarPageUrl: `${SERVER}/apps/calendar/p/AbC123xyz/timeGridDay/2026-11-03`,
            meetingLink: {type: 'teams', url: 'https://teams.microsoft.com/l/meetup-join/abc'},
        }]);
    });
});

describe('toRequestUrl', () => {
    const url = new URL('https://cloud.example.com/remote.php/dav/public-calendars/AbC123/?export');

    test('sends the configured Nextcloud through the same-origin proxy', () => {
        expect(toRequestUrl(url, 'https://cloud.example.com')).toBe('/vibemost-nextcloud/remote.php/dav/public-calendars/AbC123/?export');
    });

    test('requests any other Nextcloud directly', () => {
        expect(toRequestUrl(url, 'https://other.example.com')).toBe(url.href);
        expect(toRequestUrl(url, null)).toBe(url.href);
    });
});
