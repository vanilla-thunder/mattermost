// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {flushSync} from 'react-dom';
import {createRoot} from 'react-dom/client';

import {createLegacyRender} from './react_dom_compatibility';

describe('legacy ReactDOM.render shim for plugins', () => {
    const {render, unmountComponentAtNode} = createLegacyRender(createRoot, flushSync);

    test('renders synchronously, re-renders into the same root, and unmounts', () => {
        const container = document.createElement('div');
        const callback = jest.fn();

        render(<span>{'first'}</span>, container, callback);
        expect(container.innerHTML).toBe('<span>first</span>');
        expect(callback).toHaveBeenCalledTimes(1);

        render(<span>{'second'}</span>, container);
        expect(container.innerHTML).toBe('<span>second</span>');

        expect(unmountComponentAtNode(container)).toBe(true);
        expect(container.innerHTML).toBe('');
        expect(unmountComponentAtNode(container)).toBe(false);
    });
});
