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

const queryparser = require('../../utils/query-parser');

describe('Query Parser', () => {
  it('parses single query param', () => {
    const params = queryparser('foo=123');
    expect(params.foo).to.equal('123');
  });

  it('parses multiple query param', () => {
    const params = queryparser('foo=123&bar=foo');
    expect(params.foo).to.equal('123');
    expect(params.bar).to.equal('foo');
  });

  it('does not strip leading `?`', () => {
    const params = queryparser('?foo=123');
    expect(params['?foo']).to.equal('123');
  })

  it('does not decode name', () => {
    const params = queryparser('fo%20o=123');
    expect(params['fo%20o']).to.equal('123');
  });

  it('does not decode value', () => {
    const params = queryparser('foo=123%20');
    expect(params.foo).to.equal('123%20');
  });

  it('limits maximum params to 25', () => {
    const qs = [];
    for (let i = 0; i < 26; i++) {
      qs.push(`${i}=${i}`);
    }

    const params = queryparser(qs.join('&'));

    const keys = Object.keys(params);
    expect(keys).to.have.length(25);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      expect(params[key]).to.equal(key);
    }
  });

  it('properly resets after maximum hit', () => {
    const qs = [];
    for (let i = 0; i < 26; i++) {
      qs.push(`${i}=${i}`);
    }
    queryparser(qs.join('&'));

    const params = queryparser('foo=123');
    expect(params.foo).to.equal('123');
  });
});
