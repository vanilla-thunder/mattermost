// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import classNames from 'classnames';
import React from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';

import {setStatus} from 'mattermost-redux/actions/users';
import {Preferences} from 'mattermost-redux/constants';
import {get} from 'mattermost-redux/selectors/entities/preferences';
import {getCurrentTimezone} from 'mattermost-redux/selectors/entities/timezone';
import {getCurrentUserId, getStatusForUserId} from 'mattermost-redux/selectors/entities/users';

import {openModal} from 'actions/views/modals';

import * as Menu from 'components/menu';
import ResetStatusModal from 'components/reset_status_modal';
import {useDndDurationMenuItems} from 'components/user_account_menu/user_account_dnd_menuitem';

import {ModalIdentifiers, UserStatuses} from 'utils/constants';

import type {GlobalState} from 'types/store';

import './status_switch.scss';

type SwitchStatus = typeof UserStatuses.ONLINE | typeof UserStatuses.AWAY | typeof UserStatuses.OFFLINE;

/**
 * Online / away / do-not-disturb / offline switch shown in the global header.
 * Online, away and offline are set with a single click; dnd opens a menu to
 * choose how long it lasts.
 */
export default function StatusSwitch() {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();

    const userId = useSelector(getCurrentUserId);
    const status = useSelector((state: GlobalState) => getStatusForUserId(state, userId));
    const autoResetPref = useSelector((state: GlobalState) => get(state, Preferences.CATEGORY_AUTO_RESET_MANUAL_STATUS, userId, ''));
    const timezone = useSelector(getCurrentTimezone);

    // Same rule as the account menu: leaving "out of office" without a saved
    // auto-reset preference asks whether automatic replies should be turned off.
    const shouldConfirmBeforeStatusChange = autoResetPref === '' && status === UserStatuses.OUT_OF_OFFICE;

    const dndDurationItems = useDndDurationMenuItems({userId, timezone, shouldConfirmBeforeStatusChange});

    if (!userId) {
        return null;
    }

    const options: Array<{status: SwitchStatus; label: string; title: string}> = [
        {
            status: UserStatuses.ONLINE,
            label: formatMessage({id: 'globalHeader.statusSwitch.online', defaultMessage: 'online'}),
            title: formatMessage({id: 'globalHeader.statusSwitch.online.title', defaultMessage: 'Set your status to online'}),
        },
        {
            status: UserStatuses.AWAY,
            label: formatMessage({id: 'globalHeader.statusSwitch.away', defaultMessage: 'afk'}),
            title: formatMessage({id: 'globalHeader.statusSwitch.away.title', defaultMessage: 'Set your status to away'}),
        },
    ];

    function handleClick(newStatus: SwitchStatus) {
        if (newStatus === status) {
            return;
        }

        if (shouldConfirmBeforeStatusChange) {
            dispatch(openModal({
                modalId: ModalIdentifiers.RESET_STATUS,
                dialogType: ResetStatusModal,
                dialogProps: {newStatus},
            }));
            return;
        }

        dispatch(setStatus({
            user_id: userId,
            status: newStatus,
        }));
    }

    const offlineOption = {
        status: UserStatuses.OFFLINE as SwitchStatus,
        label: formatMessage({id: 'globalHeader.statusSwitch.offline', defaultMessage: 'offline'}),
        title: formatMessage({id: 'globalHeader.statusSwitch.offline.title', defaultMessage: 'Set your status to offline'}),
    };

    function renderOption(option: {status: SwitchStatus; label: string; title: string}) {
        const selected = option.status === status;
        return (
            <button
                key={option.status}
                type='button'
                aria-pressed={selected}
                title={option.title}
                className={classNames('StatusSwitch__option', `StatusSwitch__option--${option.status}`, {
                    'StatusSwitch__option--selected': selected,
                })}
                onClick={() => handleClick(option.status)}
            >
                <span
                    className='StatusSwitch__light'
                    aria-hidden='true'
                />
                {option.label}
            </button>
        );
    }

    const isDnd = status === UserStatuses.DND;

    return (
        <div
            className='StatusSwitch'
            role='group'
            aria-label={formatMessage({id: 'globalHeader.statusSwitch.ariaLabel', defaultMessage: 'Your status'})}
        >
            {options.map(renderOption)}
            <Menu.Container
                menuButton={{
                    id: 'statusSwitchDndButton',
                    class: classNames('StatusSwitch__option', 'StatusSwitch__option--dnd', {
                        'StatusSwitch__option--selected': isDnd,
                    }),
                    'aria-label': formatMessage({id: 'globalHeader.statusSwitch.dnd.ariaLabel', defaultMessage: 'dnd, choose how long'}),
                    children: (
                        <>
                            <span
                                className='StatusSwitch__light'
                                aria-hidden='true'
                            />
                            <FormattedMessage
                                id='globalHeader.statusSwitch.dnd'
                                defaultMessage='dnd'
                            />
                        </>
                    ),
                }}
                menuButtonTooltip={{
                    text: formatMessage({id: 'globalHeader.statusSwitch.dnd.title', defaultMessage: 'Set your status to do not disturb'}),
                }}
                menu={{
                    id: 'statusSwitchDndMenu',
                    'aria-labelledby': 'statusSwitchDndMenuTitle',
                }}
                menuHeader={
                    <h5
                        id='statusSwitchDndMenuTitle'
                        className='StatusSwitch__menuTitle'
                    >
                        {formatMessage({id: 'userAccountMenu.dndSubMenu.title', defaultMessage: 'Clear after:'})}
                    </h5>
                }
                anchorOrigin={{vertical: 'bottom', horizontal: 'right'}}
                transformOrigin={{vertical: 'top', horizontal: 'right'}}
            >
                {dndDurationItems}
            </Menu.Container>
            {renderOption(offlineOption)}
        </div>
    );
}
