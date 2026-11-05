// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState} from 'react';
import {FormattedMessage, useIntl} from 'react-intl';

import {Button} from '@mattermost/shared/components/button';

import {CalendarShareNotFoundError, fetchCalendar, parseShareLink, shareLinkOf} from './caldav_client';
import {DEFAULT_EVENTS_LIMIT, MAX_EVENTS_LIMIT} from './settings_storage';
import type {CalendarSettings} from './settings_storage';

type Props = {
    settings: CalendarSettings | null;
    onSave: (settings: CalendarSettings) => void;
    onDisconnect: () => void;
    onCancel: () => void;
};

type FormError = 'invalid' | 'not_found' | 'connection';

const LIMIT_OPTIONS = Array.from({length: MAX_EVENTS_LIMIT}, (_, i) => i + 1);

export default function ShareLinkForm({settings, onSave, onDisconnect, onCancel}: Props) {
    const {formatMessage} = useIntl();
    const [link, setLink] = useState(settings ? shareLinkOf(settings.share) : '');
    const [eventsLimit, setEventsLimit] = useState(settings?.eventsLimit ?? DEFAULT_EVENTS_LIMIT);
    const [error, setError] = useState<FormError | null>(null);
    const [checking, setChecking] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const newShare = parseShareLink(link);
        if (!newShare) {
            setError('invalid');
            return;
        }

        setChecking(true);
        setError(null);
        try {
            // Checks the link before it is saved
            await fetchCalendar(newShare);
            onSave({share: newShare, eventsLimit});
        } catch (err) {
            setError(err instanceof CalendarShareNotFoundError ? 'not_found' : 'connection');
        } finally {
            setChecking(false);
        }
    };

    let errorMessage;
    switch (error) {
    case 'invalid':
        errorMessage = formatMessage({id: 'nextcloud_calendar.form.error.invalid', defaultMessage: 'Paste a public calendar link, e.g. https://cloud.example.com/apps/calendar/p/…'});
        break;
    case 'not_found':
        errorMessage = formatMessage({id: 'nextcloud_calendar.form.error.not_found', defaultMessage: 'Nextcloud does not know this link. Check that sharing by link is still on.'});
        break;
    case 'connection':
        errorMessage = formatMessage({id: 'nextcloud_calendar.form.error.connection', defaultMessage: 'Could not reach the Nextcloud calendar. Check the link.'});
        break;
    }

    const linkLabel = formatMessage({id: 'nextcloud_calendar.form.link', defaultMessage: 'Public calendar link'});
    const limitId = 'nextcloudCalendarEventsLimit';

    return (
        <form
            className='NextcloudCalendar__form'
            onSubmit={handleSubmit}
            noValidate={true}
        >
            <input
                className='NextcloudCalendar__input'
                type='url'
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder={linkLabel}
                aria-label={linkLabel}
                spellCheck={false}
            />
            <p className='NextcloudCalendar__hint'>
                <FormattedMessage
                    id='nextcloud_calendar.form.link.hint'
                    defaultMessage='In the Nextcloud Calendar app, open the menu of your calendar, choose Share and copy the share link. It is stored in this browser only.'
                />
            </p>
            <div className='NextcloudCalendar__field'>
                <label htmlFor={limitId}>
                    <FormattedMessage
                        id='nextcloud_calendar.form.events_limit'
                        defaultMessage='Events to show'
                    />
                </label>
                <select
                    id={limitId}
                    className='NextcloudCalendar__input NextcloudCalendar__select'
                    value={eventsLimit}
                    onChange={(e) => setEventsLimit(Number(e.target.value))}
                >
                    {LIMIT_OPTIONS.map((option) => (
                        <option
                            key={option}
                            value={option}
                        >
                            {option}
                        </option>
                    ))}
                </select>
            </div>
            {errorMessage && (
                <p
                    className='NextcloudCalendar__error'
                    role='alert'
                >
                    {errorMessage}
                </p>
            )}
            <div className='NextcloudCalendar__formButtons'>
                {settings && (
                    <Button
                        type='button'
                        emphasis='tertiary'
                        variant='destructive'
                        size='xs'
                        onClick={onDisconnect}
                        disabled={checking}
                    >
                        <FormattedMessage
                            id='nextcloud_calendar.form.disconnect'
                            defaultMessage='Disconnect'
                        />
                    </Button>
                )}
                <Button
                    type='button'
                    emphasis='tertiary'
                    size='xs'
                    onClick={onCancel}
                    disabled={checking}
                >
                    <FormattedMessage
                        id='nextcloud_calendar.form.cancel'
                        defaultMessage='Cancel'
                    />
                </Button>
                <Button
                    type='submit'
                    emphasis='primary'
                    size='xs'
                    disabled={checking}
                >
                    {checking ? (
                        <FormattedMessage
                            id='nextcloud_calendar.form.saving'
                            defaultMessage='Saving…'
                        />
                    ) : (
                        <FormattedMessage
                            id='nextcloud_calendar.form.save'
                            defaultMessage='Save'
                        />
                    )}
                </Button>
            </div>
        </form>
    );
}
