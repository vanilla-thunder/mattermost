// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {ICalendarEvent} from './icalendar';

export type MeetingLinkType = 'teams' | 'jitsi';

export type MeetingLink = {
    type: MeetingLinkType;
    url: string;
};

/** Link types in order of preference: an event with both links is joined via Teams. */
const MEETING_LINK_PRIORITY: MeetingLinkType[] = ['teams', 'jitsi'];

/** Microsoft Teams hosts and path prefixes of meeting links. */
const TEAMS_MEETING_PATHS: Record<string, string[]> = {
    'teams.microsoft.com': ['/l/meetup-join/', '/meet/'],
    'teams.live.com': ['/meet/'],
};

const URL_REGEX = /https:\/\/[^\s<>"'\\]+/gi;

/** Punctuation that is likely part of the surrounding text rather than the URL. */
const TRAILING_PUNCTUATION_REGEX = /[).,;:!?\]}]+$/;

/**
 * Detect the meeting link type of a URL. Only exact https hosts from the allow lists are
 * accepted, since calendar data is untrusted. Jitsi servers are configured per deployment
 * (VIBEMOST_JITSI_HOSTS) and given in lower case.
 */
function toMeetingLink(rawUrl: string, jitsiHosts: readonly string[]): MeetingLink | null {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        return null;
    }

    if (url.protocol !== 'https:' || url.username || url.password) {
        return null;
    }

    const host = url.hostname.toLowerCase();

    if (TEAMS_MEETING_PATHS[host]?.some((prefix) => url.pathname.startsWith(prefix))) {
        return {type: 'teams', url: url.href};
    }

    // The Jitsi room name is the first path segment; the server root is not a meeting.
    if (jitsiHosts.includes(host) && url.pathname.length > 1) {
        return {type: 'jitsi', url: url.href};
    }

    return null;
}

function findUrls(text: string): string[] {
    return Array.from(text.matchAll(URL_REGEX), ([match]) => match.replace(TRAILING_PUNCTUATION_REGEX, ''));
}

/**
 * Find a meeting link in a calendar event. Teams links win over Jitsi links wherever they
 * appear; within a type, dedicated conference properties win over links found in the text.
 */
export function findMeetingLink(event: ICalendarEvent, jitsiHosts: readonly string[]): MeetingLink | null {
    const candidates = [
        ...event.conferences,
        ...[event.url, event.location, event.description].flatMap((text) => (text ? findUrls(text) : [])),
    ];

    const links = candidates.map((candidate) => toMeetingLink(candidate, jitsiHosts)).filter((link): link is MeetingLink => link !== null);
    for (const type of MEETING_LINK_PRIORITY) {
        const link = links.find((candidate) => candidate.type === type);
        if (link) {
            return link;
        }
    }

    return null;
}
