/**
 * Copyright 2017 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Frame } from '../../utils/stacktrace/frame.js';

describe('Frame', () => {
  describe('#toString', () => {
    describe('with context name', () => {
      it('includes context with parenthesis around location', () => {
        const f = new Frame('name', 'file.js', '1', '2');
        expect(f.toString()).to.equal('    at name (file.js:1:2)');
      });
    });

    describe('without context name', () => {
      it('includes location without parenthesis', () => {
        const f = new Frame('', 'file.js', '1', '2');
        expect(f.toString()).to.equal('    at file.js:1:2');
      });
    });
  });

  describe('path deduplication', () => {
    [
      [
        'https://raw.githubusercontent.com/ampproject/amphtml/2004142326360/extensions/amp-viewer-integration/0.1/messaging/extensions/amp-viewer-integration/0.1/messaging/messaging.js',
        'https://raw.githubusercontent.com/ampproject/amphtml/2004142326360/extensions/amp-viewer-integration/0.1/messaging/messaging.js',
      ],
      [
        'https://raw.githubusercontent.com/ampproject/amphtml/2004071640410/src/service/src/service/storage-impl.js',
        'https://raw.githubusercontent.com/ampproject/amphtml/2004071640410/src/service/storage-impl.js',
      ],
      [
        'https://raw.githubusercontent.com/ampproject/amphtml/2004071640410/src/src/chunk.js',
        'https://raw.githubusercontent.com/ampproject/amphtml/2004071640410/src/chunk.js',
      ],
      [
        'https://raw.githubusercontent.com/ampproject/amphtml/2004071640410/src/src-subdir/chunk.js',
        'https://raw.githubusercontent.com/ampproject/amphtml/2004071640410/src/src-subdir/chunk.js',
      ],
      ['unexpected-token.js', 'unexpected-token.js'],
    ].forEach(([duped, fixed], index) => {
      it(`fixes duplicated source paths: ${index}`, () => {
        const frame = new Frame('name', duped, '1', '2');
        expect(frame.source).to.equal(fixed);
      });
    });
  });
});
