// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {ICalendarEvent} from './icalendar';
import {findMeetingLink} from './meeting_link';

function event(props: Partial<ICalendarEvent> = {}): ICalendarEvent {
    return {
        uid: null,
        summary: null,
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
        ...props,
    };
}

const JITSI_HOSTS = ['meet.example.com', 'jitsi.example.org'];

function findLink(calendarEvent: ICalendarEvent) {
    return findMeetingLink(calendarEvent, JITSI_HOSTS);
}

const TEAMS_URL = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7b%22Tid%22%3a%221%22%7d';

describe('findMeetingLink', () => {
    test('finds a Teams link in the Teams specific property', () => {
        expect(findLink(event({conferences: [TEAMS_URL]}))).toEqual({type: 'teams', url: TEAMS_URL});
    });

    test('finds a Teams link in an Outlook invitation description', () => {
        const description = `Microsoft Teams meeting\nJoin on your computer: <${TEAMS_URL}>\nMeeting ID: 123`;
        expect(findLink(event({description}))).toEqual({type: 'teams', url: TEAMS_URL});
    });

    test('finds Jitsi links on both servers', () => {
        expect(findLink(event({location: 'https://meet.example.com/Standup'}))).
            toEqual({type: 'jitsi', url: 'https://meet.example.com/Standup'});
        expect(findLink(event({description: 'Join here: https://jitsi.example.org/Planning.'}))).
            toEqual({type: 'jitsi', url: 'https://jitsi.example.org/Planning'});
    });

    test('prefers Teams over Jitsi wherever the links appear', () => {
        expect(findLink(event({
            conferences: ['https://meet.example.com/Conference'],
            description: `Backup: ${TEAMS_URL}`,
        }))).toEqual({type: 'teams', url: TEAMS_URL});

        expect(findLink(event({
            location: 'https://jitsi.example.org/Room',
            description: TEAMS_URL,
        }))?.type).toBe('teams');
    });

    test('prefers conference properties over text within the same type', () => {
        expect(findLink(event({
            conferences: ['https://meet.example.com/Conference'],
            description: 'https://jitsi.example.org/Text',
        }))?.url).toBe('https://meet.example.com/Conference');
    });

    test('ignores links that are not meetings', () => {
        expect(findLink(event({location: 'https://meet.example.com/'}))).toBeNull();
        expect(findLink(event({description: 'https://teams.microsoft.com/_#/calendarv2'}))).toBeNull();
        expect(findLink(event({location: 'Room 42'}))).toBeNull();
    });

    test('finds no Jitsi links when no Jitsi servers are configured', () => {
        expect(findMeetingLink(event({location: 'https://meet.example.com/Standup'}), [])).toBeNull();
        expect(findMeetingLink(event({location: `https://meet.example.com/Standup ${TEAMS_URL}`}), [])).
            toEqual({type: 'teams', url: TEAMS_URL});
    });

    test('rejects look-alike, non-https and credential URLs', () => {
        const urls = [
            'https://meet.example.com.evil.example/Room',
            'https://evil.example/meet.example.com/Room',
            'https://eviljitsi.example.org/Room',
            'http://meet.example.com/Room',
            'https://meet.example.com@evil.example/Room',
            'https://user:pass@meet.example.com/Room',
            'javascript:alert(1)//https://meet.example.com/Room', // eslint-disable-line no-script-url
            'https://teams.microsoft.com.evil.example/l/meetup-join/x',
        ];
        for (const url of urls) {
            expect(findLink(event({conferences: [url]}))).toBeNull();
        }
    });
});
