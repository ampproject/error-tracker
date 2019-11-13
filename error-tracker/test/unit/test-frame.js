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

const Frame = require('../../utils/frame');

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
});
