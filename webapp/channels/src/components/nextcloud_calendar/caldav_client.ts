// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {eventEnd, parseICalendarEvents} from './icalendar';
import {findMeetingLink} from './meeting_link';
import type {MeetingLink} from './meeting_link';
import {loadRuntimeConfig, NEXTCLOUD_PROXY_PATH} from './runtime_config';

/**
 * A Nextcloud calendar shared by public link (Calendar app > calendar > Share > Share link).
 * The link grants read-only access without a login.
 */
export type CalendarShare = {

    /** Nextcloud base URL without trailing slash, e.g. https://cloud.example.com */
    serverUrl: string;
    token: string;
};

export type Calendar = {
    displayName: string | null;
    color: string | null;
};

export type UpcomingEvent = {

    /** Unique key of the event occurrence. */
    key: string;
    summary: string | null;

    /** Start time in milliseconds since the epoch. */
    start: number;

    /** End time in milliseconds since the epoch; exclusive. For all-day events local midnight after the last day. */
    end: number;
    isAllDay: boolean;
    isRecurring: boolean;
    calendarName: string | null;
    color: string | null;

    /** Day of the event on the public calendar page. */
    calendarPageUrl: string;
    meetingLink: MeetingLink | null;
};

/** The share link does not exist (anymore), e.g. because sharing was turned off. */
export class CalendarShareNotFoundError extends Error {
    constructor() {
        super('The Nextcloud calendar share link is not valid');
        this.name = 'CalendarShareNotFoundError';
    }
}

const DAV_NS = 'DAV:';
const CALDAV_NS = 'urn:ietf:params:xml:ns:caldav';
const APPLE_NS = 'http://apple.com/ns/ical/';

/** Path of the dev server proxy to Nextcloud (webpack.config.js). */

/** Base path and token of public calendar links: the web page, the embed page, or CalDAV. */
const SHARE_PATH_REGEX = /^(.*?)(?:\/index\.php)?\/(?:apps\/calendar\/(?:p|embed)|remote\.php\/dav\/public-calendars)\/([A-Za-z0-9]+)(?:\/.*)?$/;

/**
 * Parse a user-entered public calendar link, e.g. https://cloud.example.com/apps/calendar/p/AbC123.
 * Returns null if it is not usable. Plain http is only accepted for localhost.
 */
export function parseShareLink(input: string): CalendarShare | null {
    let url: URL;
    try {
        url = new URL(input.trim());
    } catch {
        return null;
    }

    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost)) {
        return null;
    }
    if (url.username || url.password) {
        return null;
    }

    const match = url.pathname.match(SHARE_PATH_REGEX);
    if (!match) {
        return null;
    }
    return {serverUrl: url.origin + match[1], token: match[2]};
}

export function shareLinkOf(share: CalendarShare): string {
    return `${share.serverUrl}/apps/calendar/p/${share.token}`;
}

function calendarDavUrl(share: CalendarShare): URL {
    return new URL(`${share.serverUrl}/remote.php/dav/public-calendars/${share.token}/`);
}

/**
 * Map a Nextcloud URL to the URL the browser requests. The Nextcloud server configured for
 * this deployment (VIBEMOST_NEXTCLOUD_URL) is reached through a same-origin proxy: the dev
 * server's in development, the container's nginx in production. So no CORS setup is needed
 * for it. Any other Nextcloud is requested directly and must allow CORS from the Vibemost
 * origin.
 */
export function toRequestUrl(url: URL, proxyOrigin: string | null): string {
    if (proxyOrigin && url.origin === proxyOrigin) {
        return NEXTCLOUD_PROXY_PATH + url.pathname + url.search;
    }
    return url.href;
}

type DavResponse = {

    /** Resource URL, resolved against the Nextcloud server. */
    url: URL;

    /** <d:prop> of the successful <d:propstat>, if any. */
    prop: Element | null;
};

function firstChild(parent: Element | null, namespace: string, localName: string): Element | null {
    return parent?.getElementsByTagNameNS(namespace, localName)[0] ?? null;
}

function childText(parent: Element | null, namespace: string, localName: string): string | null {
    const text = firstChild(parent, namespace, localName)?.textContent?.trim();
    return text || null;
}

export function parseMultistatus(xml: string, serverUrl: string): DavResponse[] {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) {
        throw new Error('Nextcloud returned invalid XML');
    }

    return Array.from(doc.getElementsByTagNameNS(DAV_NS, 'response')).flatMap((response) => {
        const href = childText(response, DAV_NS, 'href');
        if (!href) {
            return [];
        }

        const okPropstat = Array.from(response.getElementsByTagNameNS(DAV_NS, 'propstat')).find((propstat) => {
            return (/\s200\s/).test(childText(propstat, DAV_NS, 'status') ?? '');
        });

        return [{url: new URL(href, serverUrl), prop: firstChild(okPropstat ?? null, DAV_NS, 'prop')}];
    });
}

/** Send an anonymous WebDAV request and return the multistatus XML. */
async function davFetch(method: 'PROPFIND' | 'REPORT', url: URL, depth: '0' | '1', body: string): Promise<string> {
    const {nextcloudOrigin} = await loadRuntimeConfig();
    const response = await fetch(toRequestUrl(url, nextcloudOrigin), {
        method,
        credentials: 'omit',
        headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            Depth: depth,

            // Makes Nextcloud omit WWW-Authenticate on 401, so the browser shows no login dialog.
            'X-Requested-With': 'XMLHttpRequest',
        },
        body,
    });

    if (response.status === 401 || response.status === 403 || response.status === 404) {
        throw new CalendarShareNotFoundError();
    }
    if (response.status !== 207) {
        throw new Error(`${method} ${url.pathname} failed with HTTP ${response.status}`);
    }

    return response.text();
}

export function toCalendar(xml: string, serverUrl: string): Calendar {
    const prop = parseMultistatus(xml, serverUrl)[0]?.prop ?? null;
    return {
        displayName: childText(prop, DAV_NS, 'displayname'),

        // Nextcloud stores colors as #RRGGBBAA; the alpha part is not wanted here.
        color: childText(prop, APPLE_NS, 'calendar-color')?.match(/^#[0-9a-f]{6}/i)?.[0] ?? null,
    };
}

/** Fetch the calendar's name and color. Also checks that the share link works. */
export async function fetchCalendar(share: CalendarShare): Promise<Calendar> {
    const body = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="${DAV_NS}" xmlns:a="${APPLE_NS}"><d:prop><d:displayname/><a:calendar-color/></d:prop></d:propfind>`;
    return toCalendar(await davFetch('PROPFIND', calendarDavUrl(share), '0', body), share.serverUrl);
}

/** Format a date as iCalendar UTC DATE-TIME, e.g. 20260924T120000Z. */
function toICalendarDateTime(date: Date): string {
    return date.toISOString().replace(/\.\d{3}/, '').replace(/[-:]/g, '');
}

/** Format a date as YYYY-MM-DD in local time. */
function toLocalDate(time: number): string {
    const date = new Date(time);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Turn a calendar-query response into upcoming events. Cancelled events and events without
 * a start are left out.
 */
export function toUpcomingEvents(share: CalendarShare, calendar: Calendar, xml: string, jitsiHosts: readonly string[]): UpcomingEvent[] {
    return parseMultistatus(xml, share.serverUrl).flatMap((response) => {
        const data = childText(response.prop, CALDAV_NS, 'calendar-data');
        if (!data) {
            return [];
        }

        return parseICalendarEvents(data).flatMap((event): UpcomingEvent[] => {
            if (event.start === null || event.status === 'CANCELLED') {
                return [];
            }
            return [{
                key: `${response.url.pathname}#${event.recurrenceId ?? ''}`,
                summary: event.summary,
                start: event.start,
                end: eventEnd(event) ?? event.start,
                isAllDay: event.allDay,
                isRecurring: event.recurrenceId !== null,
                calendarName: calendar.displayName,
                color: calendar.color,
                calendarPageUrl: `${shareLinkOf(share)}/timeGridDay/${toLocalDate(event.start)}`,
                meetingLink: findMeetingLink(event, jitsiHosts),
            }];
        });
    });
}

/**
 * Find events overlapping the time range. The server expands recurring events into single
 * occurrences with UTC times.
 */
async function fetchEventsInTimeRange(share: CalendarShare, calendar: Calendar, from: Date, to: Date): Promise<UpcomingEvent[]> {
    const timeRange = `start="${toICalendarDateTime(from)}" end="${toICalendarDateTime(to)}"`;
    const body = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="${DAV_NS}" xmlns:c="${CALDAV_NS}">
<d:prop><c:calendar-data><c:expand ${timeRange}/></c:calendar-data></d:prop>
<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range ${timeRange}/></c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>`;

    const xml = await davFetch('REPORT', calendarDavUrl(share), '1', body);
    const {jitsiHosts} = await loadRuntimeConfig();
    return toUpcomingEvents(share, calendar, xml, jitsiHosts);
}

/** Fetch today's and tomorrow's events (including ongoing ones) from the shared calendar, soonest first. */
export async function fetchUpcomingEvents(share: CalendarShare, now = new Date()): Promise<UpcomingEvent[]> {
    // End of tomorrow in local time
    const to = new Date(now);
    to.setHours(48, 0, 0, 0);

    const calendar = await fetchCalendar(share);
    const events = await fetchEventsInTimeRange(share, calendar, now, to);
    return events.sort((a, b) => a.start - b.start);
}
