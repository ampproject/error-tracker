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

import { stringify } from '../../utils/requests/query-string.js';

describe('Query String', () => {
  describe('stringify', () => {
    it('builds query string', () => {
      const result = stringify({ test: 'value' });
      expect(result).to.equal('test=value');
    });

    it('does not prepend "?"', () => {
      const result = stringify({ test: 'value' });
      expect(result.startsWith('?')).to.equal(false);
    });

    it('joins multiple params with "&"', () => {
      const result = stringify({ test: 'value', next: 'next' });
      expect(result).to.equal('test=value&next=next');
    });

    it('leaves empty value for empty strings', () => {
      const result = stringify({ test: '' });
      expect(result).to.equal('test=');
    });

    it('encodes keys', () => {
      const result = stringify({ 'te st': 'value' });
      expect(result).to.equal('te%20st=value');
    });

    it('encodes values', () => {
      const result = stringify({ test: 'val ue' });
      expect(result).to.equal('test=val%20ue');
    });

    it('iterates enumerable properties', () => {
      const obj = { test: 'value' };
      Object.defineProperty(obj, 'next', {
        value: 'next',
      });

      const result = stringify(obj);
      expect(result).to.equal('test=value');
    });
  });
});
