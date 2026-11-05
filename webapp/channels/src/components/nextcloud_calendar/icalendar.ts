// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/** Minimal VEVENT data extracted from iCalendar (RFC 5545) data. */
export type ICalendarEvent = {
    uid: string | null;
    summary: string | null;

    /** Start time in milliseconds since the epoch. */
    start: number | null;

    /** Whether the start is a DATE without time, i.e. an all-day event. */
    allDay: boolean;

    /** End time (DTEND) in milliseconds since the epoch; exclusive. */
    end: number | null;

    /** Length (DURATION) in milliseconds, used when there is no DTEND. */
    duration: number | null;

    /** Recurrence ID in milliseconds since the epoch, set for occurrences of recurring events. */
    recurrenceId: number | null;
    status: string | null;
    location: string | null;
    description: string | null;
    url: string | null;

    /** Conference URIs (RFC 7986 CONFERENCE and vendor specific properties). */
    conferences: string[];
};

type ContentLine = {
    name: string;
    value: string;
};

const DURATION_REGEX = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

const DAY = 24 * 60 * 60 * 1000;

const DATE_TIME_REGEX = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/;

/**
 * Split an unfolded content line into property name and value. Parameters are dropped,
 * but quoted parameter values may contain ':' (RFC 5545, 3.1).
 */
function parseContentLine(line: string): ContentLine | null {
    let inQuotes = false;
    let nameEnd = -1;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (!inQuotes && char === ';' && nameEnd === -1) {
            nameEnd = i;
        } else if (!inQuotes && char === ':') {
            return {
                name: line.slice(0, nameEnd === -1 ? i : nameEnd).toUpperCase(),
                value: line.slice(i + 1),
            };
        }
    }
    return null;
}

/** Unescape a TEXT value (RFC 5545, 3.3.11). */
function unescapeText(value: string): string {
    return value.replace(/\\([\\;,nN])/g, (_, char: string) => ((char === 'n' || char === 'N') ? '\n' : char));
}

/**
 * Parse a DATE or DATE-TIME value. UTC values (with 'Z') are exact; DATE and floating
 * values are treated as local time.
 */
function parseDateTime(value: string): number | null {
    const match = value.match(DATE_TIME_REGEX);
    if (!match) {
        return null;
    }

    const [, year, month, day, hours = '0', minutes = '0', seconds = '0', utc] = match;
    const parts = [Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds)] as const;
    const time = utc ? Date.UTC(...parts) : new Date(...parts).getTime();
    return Number.isNaN(time) ? null : time;
}

/** Parse a DURATION value (RFC 5545, 3.3.6) into milliseconds. Days count as 24 hours. */
export function parseDuration(value: string): number | null {
    const match = value.match(DURATION_REGEX);
    if (!match || value.endsWith('P') || value.endsWith('T')) {
        return null;
    }

    const [, sign, weeks = '0', days = '0', hours = '0', minutes = '0', seconds = '0'] = match;
    const duration = (((((Number(weeks) * 7) + Number(days)) * 24) + Number(hours)) * 60 * 60 * 1000) + (((Number(minutes) * 60) + Number(seconds)) * 1000);
    return sign === '-' ? -duration : duration;
}

/**
 * End time of an event. Without DTEND, the end is the start plus DURATION; without both, an
 * all-day event lasts one day and a timed event ends at its start (RFC 5545, 3.6.1).
 */
export function eventEnd(event: Pick<ICalendarEvent, 'start' | 'allDay' | 'end' | 'duration'>): number | null {
    if (event.start === null) {
        return null;
    }
    if (event.end !== null) {
        return event.end;
    }
    if (!event.allDay) {
        return event.start + (event.duration ?? 0);
    }

    // Add whole local days, so a day stays a day across daylight saving time changes
    const end = new Date(event.start);
    end.setDate(end.getDate() + Math.max(1, Math.round((event.duration ?? DAY) / DAY)));
    return end.getTime();
}

function emptyEvent(): ICalendarEvent {
    return {uid: null, summary: null, start: null, allDay: false, end: null, duration: null, recurrenceId: null, status: null, location: null, description: null, url: null, conferences: []};
}

/**
 * Extract VEVENT components from iCalendar data. Only direct VEVENT properties are
 * read; nested components (e.g. VALARM) are skipped.
 */
export function parseICalendarEvents(data: string): ICalendarEvent[] {
    const events: ICalendarEvent[] = [];

    // Stack of currently open components, e.g. ['VCALENDAR', 'VEVENT', 'VALARM']
    const components: string[] = [];
    let event: ICalendarEvent | null = null;

    // Unfold lines (RFC 5545, 3.1)
    const lines = data.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);

    for (const line of lines) {
        const contentLine = parseContentLine(line);
        if (!contentLine) {
            continue;
        }
        const {name, value} = contentLine;

        if (name === 'BEGIN') {
            components.push(value.toUpperCase());
            if (components[components.length - 1] === 'VEVENT') {
                event = emptyEvent();
            }
            continue;
        }

        if (name === 'END') {
            if (components.pop() === 'VEVENT' && event) {
                events.push(event);
                event = null;
            }
            continue;
        }

        if (!event || components[components.length - 1] !== 'VEVENT') {
            continue;
        }

        switch (name) {
        case 'UID':
            event.uid = value;
            break;
        case 'SUMMARY':
            event.summary = unescapeText(value);
            break;
        case 'DTSTART':
            event.start = parseDateTime(value);
            event.allDay = !value.includes('T');
            break;
        case 'DTEND':
            event.end = parseDateTime(value);
            break;
        case 'DURATION':
            event.duration = parseDuration(value);
            break;
        case 'RECURRENCE-ID':
            event.recurrenceId = parseDateTime(value);
            break;
        case 'STATUS':
            event.status = value.toUpperCase();
            break;
        case 'LOCATION':
            event.location = unescapeText(value);
            break;
        case 'DESCRIPTION':
            event.description = unescapeText(value);
            break;
        case 'URL':
            event.url = value;
            break;
        case 'CONFERENCE':
        case 'X-MICROSOFT-SKYPETEAMSMEETINGURL':
            event.conferences.push(value);
            break;
        }
    }

    return events;
}
