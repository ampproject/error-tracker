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

const shouldIgnore = require('../../utils/stacktrace/should-ignore');
const Frame = require('../../utils/stacktrace/frame');

describe('shouldIgnore', () => {
  const jsFrame = new Frame('', 'file.js', '1', '2');
  const htmlFrame = new Frame('', 'file.html', '1', '2');
  const mjsFrame = new Frame('', 'file.mjs', '1', '2');
  const ampScriptFrame = new Frame(
    '',
    'amp-script[src="custom.js?v=1"].js',
    '1',
    '2'
  );

  const jsFrames = [jsFrame, jsFrame];
  const mjsFrames = [mjsFrame, mjsFrame];
  const mixedJsFrames = [jsFrame, mjsFrame, jsFrame];
  const mixedFrames = [jsFrame, htmlFrame, jsFrame];
  const htmlFrames = [htmlFrame, htmlFrame];
  const ampScriptFrames = [ampScriptFrame, jsFrame, ampScriptFrame, jsFrame];

  describe('with acceptable error message', () => {
    const message = 'Error: something happened!';

    it('does not ignore js frames', () => {
      expect(shouldIgnore(message, jsFrames)).to.equal(false);
    });

    it('does not ignore mjs frames', () => {
      expect(shouldIgnore(message, mjsFrames)).to.equal(false);
    });

    it('does not ignore mixed js and mjs frames', () => {
      expect(shouldIgnore(message, mixedJsFrames)).to.equal(false);
    });

    it('ignores mixed frames', () => {
      expect(shouldIgnore(message, mixedFrames)).to.equal(true);
    });

    it('ignores html frames', () => {
      expect(shouldIgnore(message, htmlFrames)).to.equal(true);
    });

    it('ignores amp-scipt frames', () => {
      expect(shouldIgnore(message, ampScriptFrames)).to.equal(true);
    });
  });

  describe('with blacklisted error message', () => {
    [
      'stop_youtube',
      'null%20is%20not%20an%20object%20(evaluating%20%27elt.parentNode%27)',
    ].forEach(message => {
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
