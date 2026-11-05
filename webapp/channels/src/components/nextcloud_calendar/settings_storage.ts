// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {CalendarShare} from './caldav_client';

export type CalendarSettings = {
    share: CalendarShare;

    /** How many upcoming events to show. */
    eventsLimit: number;
};

export const DEFAULT_EVENTS_LIMIT = 3;
export const MAX_EVENTS_LIMIT = 10;

/*
 * The settings are kept in this browser only and never sent to the Mattermost server.
 * Each Mattermost user on the browser has their own entry.
 */

type StoredSettings = CalendarShare & {eventsLimit?: number};

function storageKey(userId: string): string {
    return `vibemost_nextcloud_calendar_${userId}`;
}

function isValidLimit(value: unknown): value is number {
    return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_EVENTS_LIMIT;
}

export function loadSettings(userId: string): CalendarSettings | null {
    let stored: StoredSettings | null;
    try {
        stored = JSON.parse(localStorage.getItem(storageKey(userId)) ?? 'null');
    } catch {
        return null;
    }
    if (typeof stored?.serverUrl !== 'string' || typeof stored.token !== 'string') {
        return null;
    }

    return {
        share: {serverUrl: stored.serverUrl, token: stored.token},

        // Links saved before the setting existed get the default
        eventsLimit: isValidLimit(stored.eventsLimit) ? stored.eventsLimit : DEFAULT_EVENTS_LIMIT,
    };
}

export function saveSettings(userId: string, settings: CalendarSettings): void {
    const stored: StoredSettings = {...settings.share, eventsLimit: settings.eventsLimit};
    localStorage.setItem(storageKey(userId), JSON.stringify(stored));
}

export function removeSettings(userId: string): void {
    try {
        localStorage.removeItem(storageKey(userId));
    } catch {
        // Nothing stored, or storage is unavailable
    }
}

function collapsedKey(userId: string): string {
    return `vibemost_nextcloud_calendar_collapsed_${userId}`;
}

/** Whether the user collapsed the upcoming events panel. */
export function loadCollapsed(userId: string): boolean {
    try {
        return localStorage.getItem(collapsedKey(userId)) === 'true';
    } catch {
        return false;
    }
}

export function saveCollapsed(userId: string, collapsed: boolean): void {
    try {
        if (collapsed) {
            localStorage.setItem(collapsedKey(userId), 'true');
        } else {
            localStorage.removeItem(collapsedKey(userId));
        }
    } catch {
        // Storage blocked or full: the panel stays collapsed until the page is reloaded
    }
}
