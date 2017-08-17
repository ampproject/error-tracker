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

const shouldIgnore = require('../../utils/should-ignore');
const Frame = require('../../utils/frame');

describe('shouldIgnore', () => {
  const jsFrame = new Frame('', 'file.js', '1', '2');
  const htmlFrame = new Frame('', 'file.html', '1', '2');

  const jsFrames = [jsFrame, jsFrame];
  const mixedFrames = [jsFrame, htmlFrame, jsFrame];
  const htmlFrames = [htmlFrame, htmlFrame];

  describe('with acceptable error message', () => {
    const message = 'Error: something happened!';

    it('does not ignore js frames', () => {
      expect(shouldIgnore(message, jsFrames)).to.equal(false);
    });

    it('ignores mixed frames', () => {
      expect(shouldIgnore(message, mixedFrames)).to.equal(true);
    });

    it('ignores html frames', () => {
      expect(shouldIgnore(message, htmlFrames)).to.equal(true);
    });
  });

  describe('with blacklisted error message', () => {
    [
      'stop_youtube',
      'null%20is%20not%20an%20object%20(evaluating%20%27elt.parentNode%27)',
    ].forEach((message) => {
      describe(`"${message}"`, () => {
        it('ignores js frames', () => {
          expect(shouldIgnore(message, jsFrames)).to.equal(true);
        });

        it('ignores mixed frames', () => {
          expect(shouldIgnore(message, mixedFrames)).to.equal(true);
        });

        it('ignores html frames', () => {
          expect(shouldIgnore(message, htmlFrames)).to.equal(true);
        });
      });
    });
  });
});
