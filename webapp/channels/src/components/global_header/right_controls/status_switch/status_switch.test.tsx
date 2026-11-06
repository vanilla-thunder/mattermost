// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import * as userActions from 'mattermost-redux/actions/users';

import * as modalActions from 'actions/views/modals';

import {renderWithContext, screen, userEvent, waitFor} from 'tests/react_testing_utils';
import {ModalIdentifiers, UserStatuses} from 'utils/constants';

import StatusSwitch from './status_switch';

function stateWithStatus(status: string) {
    return {
        entities: {
            users: {
                currentUserId: 'user1',
                statuses: {user1: status},
            },
        },
    };
}

describe('StatusSwitch', () => {
    beforeEach(() => {
        jest.spyOn(userActions, 'setStatus').mockReturnValue(() => Promise.resolve({data: true}) as any);
        jest.spyOn(modalActions, 'openModal').mockReturnValue({type: 'MOCK_OPEN_MODAL'} as any);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('shows the four short labels and marks the current status', () => {
        renderWithContext(<StatusSwitch/>, stateWithStatus(UserStatuses.AWAY));

        expect(screen.getByRole('button', {name: 'online'})).toHaveAttribute('aria-pressed', 'false');
        expect(screen.getByRole('button', {name: 'afk'})).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', {name: /dnd/})).toHaveTextContent('dnd');
        expect(screen.getByRole('button', {name: 'offline'})).toHaveAttribute('aria-pressed', 'false');
    });

    test('sets online, away and offline with one click', async () => {
        renderWithContext(<StatusSwitch/>, stateWithStatus(UserStatuses.ONLINE));

        await userEvent.click(screen.getByRole('button', {name: 'afk'}));
        expect(userActions.setStatus).toHaveBeenCalledWith({user_id: 'user1', status: UserStatuses.AWAY});

        await userEvent.click(screen.getByRole('button', {name: 'offline'}));
        expect(userActions.setStatus).toHaveBeenCalledWith({user_id: 'user1', status: UserStatuses.OFFLINE});
    });

    test('dnd opens the duration menu and sets dnd with the chosen end time', async () => {
        renderWithContext(<StatusSwitch/>, stateWithStatus(UserStatuses.ONLINE));

        await userEvent.click(screen.getByRole('button', {name: /dnd/}));
        expect(userActions.setStatus).not.toHaveBeenCalled();
        expect(screen.getByText('Clear after:')).toBeInTheDocument();

        const before = Math.floor(Date.now() / 1000);
        await userEvent.click(screen.getByRole('menuitem', {name: /1 hour/}));

        // Menu items run their action after the menu's close animation.
        await waitFor(() => expect(userActions.setStatus).toHaveBeenCalledWith(expect.objectContaining({user_id: 'user1', status: UserStatuses.DND})));
        const endTime = (userActions.setStatus as jest.Mock).mock.calls[0][0].dnd_end_time;
        const oneHourLater = before + 3600;
        expect(endTime).toBeGreaterThanOrEqual(oneHourLater - 5);
        expect(endTime).toBeLessThanOrEqual(oneHourLater + 5);
    });

    test('dnd "don\'t clear" sets dnd without an end time', async () => {
        renderWithContext(<StatusSwitch/>, stateWithStatus(UserStatuses.ONLINE));

        await userEvent.click(screen.getByRole('button', {name: /dnd/}));
        await userEvent.click(screen.getByRole('menuitem', {name: /Don't clear/}));

        await waitFor(() => expect(userActions.setStatus).toHaveBeenCalledWith({user_id: 'user1', status: UserStatuses.DND, dnd_end_time: 0}));
    });

    test('does nothing when the current status is clicked', async () => {
        renderWithContext(<StatusSwitch/>, stateWithStatus(UserStatuses.ONLINE));

        await userEvent.click(screen.getByRole('button', {name: 'online'}));
        expect(userActions.setStatus).not.toHaveBeenCalled();
    });

    test('asks for confirmation when leaving out of office', async () => {
        renderWithContext(<StatusSwitch/>, stateWithStatus(UserStatuses.OUT_OF_OFFICE));

        await userEvent.click(screen.getByRole('button', {name: 'online'}));
        expect(userActions.setStatus).not.toHaveBeenCalled();
        expect(modalActions.openModal).toHaveBeenCalledWith(expect.objectContaining({
            modalId: ModalIdentifiers.RESET_STATUS,
            dialogProps: {newStatus: UserStatuses.ONLINE},
        }));
    });
});
