// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {eventEnd, parseDuration, parseICalendarEvents} from './icalendar';

const ics = (...lines: string[]) => lines.join('\r\n');

describe('parseICalendarEvents', () => {
    test('parses expanded occurrences of a recurring event', () => {
        const data = ics(
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'BEGIN:VEVENT',
            'UID:standup',
            'SUMMARY:Daily standup',
            'DTSTART:20260925T090000Z',
            'RECURRENCE-ID:20260925T090000Z',
            'END:VEVENT',
            'BEGIN:VEVENT',
            'UID:standup',
            'SUMMARY:Daily standup',
            'DTSTART:20260926T090000Z',
            'RECURRENCE-ID:20260926T090000Z',
            'END:VEVENT',
            'END:VCALENDAR',
        );

        expect(parseICalendarEvents(data)).toMatchObject([
            {uid: 'standup', summary: 'Daily standup', start: 1790326800000, recurrenceId: 1790326800000, status: null},
            {uid: 'standup', summary: 'Daily standup', start: 1790413200000, recurrenceId: 1790413200000, status: null},
        ]);
    });

    test('unfolds lines and unescapes text', () => {
        const data = ics(
            'BEGIN:VEVENT',
            'SUMMARY:Planning\\, review\\; retro \\\\ ',
            ' and more\\nnext line',
            'DTSTART:20260925T090000Z',
            'END:VEVENT',
        );

        expect(parseICalendarEvents(data)[0].summary).toBe('Planning, review; retro \\ and more\nnext line');
    });

    test('ignores parameters, including quoted values with colons', () => {
        const data = ics(
            'BEGIN:VEVENT',
            'SUMMARY;ALTREP="https://example.com:8080/a";LANGUAGE=en:Meeting: part 1',
            'DTSTART;TZID=UTC:20260925T090000Z',
            'status:cancelled',
            'END:VEVENT',
        );

        expect(parseICalendarEvents(data)[0]).toMatchObject({
            summary: 'Meeting: part 1',
            start: 1790326800000,
            status: 'CANCELLED',
        });
    });

    test('parses all-day and floating dates as local time', () => {
        const data = ics(
            'BEGIN:VEVENT',
            'DTSTART;VALUE=DATE:20260925',
            'END:VEVENT',
            'BEGIN:VEVENT',
            'DTSTART:20260925T090000',
            'END:VEVENT',
        );

        const [allDay, floating] = parseICalendarEvents(data);
        expect(allDay).toMatchObject({start: new Date(2026, 8, 25).getTime(), allDay: true});
        expect(floating).toMatchObject({start: new Date(2026, 8, 25, 9).getTime(), allDay: false});
    });

    test('parses DTEND and DURATION', () => {
        const data = ics(
            'BEGIN:VEVENT',
            'DTSTART;VALUE=DATE:20261103',
            'DTEND;VALUE=DATE:20261104',
            'END:VEVENT',
            'BEGIN:VEVENT',
            'DTSTART:20261103T090000Z',
            'DURATION:PT1H30M',
            'END:VEVENT',
        );

        const [allDay, timed] = parseICalendarEvents(data);
        expect(allDay).toMatchObject({end: new Date(2026, 10, 4).getTime(), duration: null});
        expect(timed).toMatchObject({end: null, duration: 90 * 60 * 1000});
    });

    test('skips properties of nested components', () => {
        const data = ics(
            'BEGIN:VEVENT',
            'SUMMARY:Event',
            'BEGIN:VALARM',
            'SUMMARY:Alarm',
            'END:VALARM',
            'END:VEVENT',
        );

        expect(parseICalendarEvents(data)).toEqual([{
            uid: null,
            summary: 'Event',
            start: null,
            allDay: false,
            end: null,
            duration: null,
            recurrenceId: null,
            status: null,
            location: null,
            description: null,
            url: null,
            conferences: [],
        }]);
    });

    test('parses fields that may contain meeting links', () => {
        const data = ics(
            'BEGIN:VEVENT',
            'LOCATION:Room 1\\, 2nd floor',
            'DESCRIPTION:Join:\\nhttps://meet.example.com/Room',
            'URL:https://example.com/event',
            'CONFERENCE;VALUE=URI;FEATURE=VIDEO:https://jitsi.example.org/Room',
            'X-MICROSOFT-SKYPETEAMSMEETINGURL:https://teams.microsoft.com/l/meetup-join/x',
            'END:VEVENT',
        );

        expect(parseICalendarEvents(data)[0]).toMatchObject({
            location: 'Room 1, 2nd floor',
            description: 'Join:\nhttps://meet.example.com/Room',
            url: 'https://example.com/event',
            conferences: ['https://jitsi.example.org/Room', 'https://teams.microsoft.com/l/meetup-join/x'],
        });
    });

    test('handles malformed data without throwing', () => {
        const data = ics(
            'garbage without colon',
            'END:VEVENT',
            'BEGIN:VEVENT',
            'DTSTART:not-a-date',
            'SUMMARY;X="unterminated:quote',
        );

        // The unclosed VEVENT is dropped
        expect(parseICalendarEvents(data)).toEqual([]);
        expect(parseICalendarEvents('')).toEqual([]);
    });
});

describe('parseDuration', () => {
    test.each([
        ['P1D', 24 * 60 * 60 * 1000],
        ['P2W', 14 * 24 * 60 * 60 * 1000],
        ['PT15M', 15 * 60 * 1000],
        ['P1DT2H3M4S', ((((24 + 2) * 60) + 3) * 60 * 1000) + 4000],
        ['-PT5M', -5 * 60 * 1000],
        ['P', null],
        ['PT', null],
        ['1D', null],
    ])('%s', (value, expected) => {
        expect(parseDuration(value)).toBe(expected);
    });
});

describe('eventEnd', () => {
    const allDayStart = new Date(2026, 10, 3).getTime();

    test('uses DTEND, then DURATION', () => {
        expect(eventEnd({start: 1000, allDay: false, end: 5000, duration: 100})).toBe(5000);
        expect(eventEnd({start: 1000, allDay: false, end: null, duration: 100})).toBe(1100);
        expect(eventEnd({start: allDayStart, allDay: true, end: null, duration: 2 * 24 * 60 * 60 * 1000})).toBe(new Date(2026, 10, 5).getTime());
    });

    test('lets all-day events without end last one day and timed events end at their start', () => {
        expect(eventEnd({start: allDayStart, allDay: true, end: null, duration: null})).toBe(new Date(2026, 10, 4).getTime());
        expect(eventEnd({start: 1000, allDay: false, end: null, duration: null})).toBe(1000);
        expect(eventEnd({start: null, allDay: false, end: null, duration: null})).toBeNull();
    });
});
