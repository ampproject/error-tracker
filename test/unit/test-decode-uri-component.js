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

const decode = require('../../utils/decode-uri-component');

describe('Decode URI Component', () => {
  it('decode encoded strings', () => {
    const string = 'https://test.com/hello⚡';
    expect(decode(encodeURIComponent(string))).to.equal(string);
  });

  it('handles improperly trimmed percent encodings', () => {
    const string = 'https://test.com/hello';
    const input = encodeURIComponent(string + '⚡').slice(0, -1);
    expect(decode(input)).to.equal(string);
  });

  it('returns empty string on invalid encodings', () => {
    const attack = encodeURIComponent('⚡').slice(0, -1);
    const string = attack + 'test';
    const result = decode(string);
    expect(result).to.not.equal(string);
    expect(result).to.include("URIError");
  });
});
