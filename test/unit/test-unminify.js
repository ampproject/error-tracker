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

import { Log } from '@google-cloud/logging';
import nock from 'nock';

import {
  unminify,
  normalizeCdnJsUrl,
} from '../../utils/stacktrace/unminify.js';
import { Frame } from '../../utils/stacktrace/frame.js';

describe('unminify', () => {
  // https://github.com/mozilla/source-map/blob/75663e0187002920ad98ed1de21e54cb85114609/test/util.js#L161-L176
  const rawSourceMap = {
    version: 3,
    file: 'min.js',
    names: ['bar', 'baz', 'n'],
    sources: ['one.js', 'two.js'],
    sourcesContent: [
      ' ONE.foo = function (bar) {\n   return baz(bar);\n };',
      ' TWO.inc = function (n) {\n   return n + 1;\n };',
    ],
    sourceRoot: 'https://cdn.ampproject.org',
    mappings:
      'CAAC,IAAI,IAAM,SAAUA,GAClB,OAAOC,IAAID;' +
      'CCDb,IAAI,IAAM,SAAUE,GAClB,OAAOA',
  };
  const frame1 = new Frame(
    'foo',
    'https://cdn.ampproject.org/v0.js',
    '1',
    '18'
  );
  const frame2 = new Frame(
    'bar',
    'https://cdn.ampproject.org/v0.js',
    '1',
    '24'
  );
  const frame3 = new Frame(
    'baz',
    'https://cdn.ampproject.org/v1.js',
    '2',
    '18'
  );
  const versionedFrame = new Frame(
    'test',
    'https://cdn.ampproject.org/rtv/001502924683165/v0.js',
    '1',
    '2'
  );
  const nonCdnFrame = new Frame('test', 'http://other.com/v0.js', '1', '2');
  const moduleFrame = new Frame(
    'foo',
    'https://cdn.ampproject.org/v0-module.js',
    '1',
    '18'
  );
  const nomoduleFrame = new Frame(
    'foo',
    'https://cdn.ampproject.org/v0-nomodule.js',
    '1',
    '18'
  );

  /** @type {sinon.SinonSandbox} */
  let sandbox;
  /** @type {sinon.SinonFakeTimers} */
  let clock;

  beforeEach(() => {
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');

    sandbox = sinon.createSandbox({
      useFakeTimers: true,
    });
    clock = sandbox.clock;
    sandbox.stub(Log.prototype, 'write').resolves();
  });

  afterEach(async () => {
    // Expired all cached sourcemaps
    await clock.tickAsync(1e10);

    sandbox.restore();

    expect(nock.pendingMocks()).to.be.empty;
    nock.cleanAll();
  });

  it('unminifies multiple frames (same file)', async () => {
    nock('https://cdn.ampproject.org')
      .get('/rtv/123/v0.js.map')
      .reply(200, rawSourceMap);

    const [f1, f2] = await unminify([frame1, frame2], '123');
    expect(f1.source).to.equal('https://cdn.ampproject.org/one.js');
    expect(f1.line).to.equal(1);
    expect(f1.column).to.equal(21);
    expect(f2.source).to.equal('https://cdn.ampproject.org/one.js');
    expect(f2.line).to.equal(2);
    expect(f2.column).to.equal(3);
  });

  it('unminifies multiple frames (multiple files)', async () => {
    nock('https://cdn.ampproject.org')
      .get('/rtv/123/v0.js.map')
      .reply(200, rawSourceMap)
      .get('/rtv/123/v1.js.map')
      .reply(200, rawSourceMap);

    const [f1, f2] = await unminify([frame1, frame3], '123');
    expect(f1.source).to.equal('https://cdn.ampproject.org/one.js');
    expect(f1.line).to.equal(1);
    expect(f1.column).to.equal(21);
    expect(f2.source).to.equal('https://cdn.ampproject.org/two.js');
    expect(f2.line).to.equal(1);
    expect(f2.column).to.equal(21);
  });

  it('is resilant to sourcemap fetches failing', async () => {
    nock('https://cdn.ampproject.org')
      .get('/rtv/123/v0.js.map')
      .reply(200, rawSourceMap)
      .get('/rtv/123/v1.js.map')
      .replyWithError('failure');

    const [f1, f2] = await unminify([frame1, frame3], '123');
    expect(f1.source).to.equal(frame1.source);
    expect(f1.line).to.equal(frame1.line);
    expect(f1.column).to.equal(frame1.column);
    expect(f2.source).to.equal(frame3.source);
    expect(f2.line).to.equal(frame3.line);
    expect(f2.column).to.equal(frame3.column);
  });

  it('does not unminify non-cdn js files', async () => {
    nock('https://cdn.ampproject.org')
      .get('/rtv/123/v0.js.map')
      .reply(200, rawSourceMap);

    const [f1, f2] = await unminify([frame1, nonCdnFrame], '123');
    expect(f1.source).to.equal('https://cdn.ampproject.org/one.js');
    expect(f1.line).to.equal(1);
    expect(f1.column).to.equal(21);
    expect(f2.source).to.equal(nonCdnFrame.source);
    expect(f2.line).to.equal(nonCdnFrame.line);
    expect(f2.column).to.equal(nonCdnFrame.column);
  });

  it('does not request same file twice (same stack)', () => {
    nock('https://cdn.ampproject.org')
      .get('/rtv/123/v0.js.map')
      .reply(200, rawSourceMap);

    return unminify([frame1, frame2], '123');
  });

  it('does not request same file twice (consecutive stacks)', () => {
    nock('https://cdn.ampproject.org')
      .get('/rtv/123/v0.js.map')
      .reply(200, rawSourceMap);

    const p = unminify([frame1], '123');
    const p2 = unminify([frame2], '123');
    return Promise.all([p, p2]);
  });

  it('does not request same file twice (after response)', async () => {
    nock('https://cdn.ampproject.org')
      .get('/rtv/123/v0.js.map')
      .reply(200, rawSourceMap);

    await unminify([frame1], '123');
    return await unminify([frame2], '123');
  });

  it('requests file twice after purge', async () => {
    nock('https://cdn.ampproject.org')
      .get('/rtv/123/v0.js.map')
      .twice()
      .reply(200, rawSourceMap);

    await unminify([frame1], '123');
    clock.tick(10000000000);
    return await unminify([frame2], '123');
  });

  it('normalizes unversioned files into rtv version', async () => {
    nock('https://cdn.ampproject.org')
      .get('/rtv/123/v0.js.map')
      .reply(200, rawSourceMap)
      .get('/rtv/124/v0.js.map')
      .reply(200, rawSourceMap)
      .get('/rtv/125/v0-module.js.map')
      .reply(200, rawSourceMap);

    await unminify([frame1], '123');
    await unminify([frame2], '124');
    return await unminify([moduleFrame], '125');
  });

  it('strips nomodule during normalization', () => {
    nock('https://cdn.ampproject.org')
      .get('/rtv/123/v0.js.map')
      .reply(200, rawSourceMap);

    return unminify([nomoduleFrame], '123');
  });

  it('does not normalize versioned files', () => {
    nock('https://cdn.ampproject.org')
      .get('/rtv/123/v0.js.map')
      .reply(200, rawSourceMap)
      .get('/rtv/001502924683165/v0.js.map')
      .reply(200, rawSourceMap);

    return unminify([frame1, versionedFrame], '123');
  });

  describe('URL normalization', () => {
    // Tests generated with:
    // const tests = [
    //   {
    //     name: 'main binary',
    //     tests: [
    //       {
    //         input: 'v0.js',
    //         expected: 'rtv/RTV123/v0.js',
    //       },
    //     ],
    //   },
    // ];
    // tests.map(({name, tests}) => {
    //   const generated = tests.map(({input: inp, expected: exp}) => {
    //     return (`
    //       it('${inp}', () => {
    //         const input = 'https://cdn.ampproject.org/${inp}';
    //         const expected = '${exp ? `https://cdn.ampproject.org/${exp}.map` : ''}';

    //         const actual = normalizeCdnJsUrl(input, 'RTV123');
    //         expect(actual).to.equal(expected);
    //       });
    //     `);
    //   });

    //   return (`
    //     describe('${name}', () => {
    //       ${generated.join('').trim()}
    //     });
    //   `);
    // }).join('');
    //
    // Parse the tests with:
    // const groups = s.match(/    describe\([^]*?\n    }\);/g);
    // JSON.stringify(groups.map((group) => {
    //   const name = group.match(/'(.*?)'/)[1];
    //   const tests = group.match(/it\([^}]*}\)/g).map((test) => {
    //     const expected = test.match(/'(.*?)'/)[1];
    //       /input = 'https:\/\/cdn.ampproject.org\/(.*?)'/
    //     )[1];
    //     const expected = test.match(
    //       /expected = '(?:https:\/\/cdn.ampproject.org\/(.*?).map)?'/
    //     )[1];
    //     return {input, expected};
    //   });
    //   return {name, tests};
    // }));

    describe('main binary', () => {
      it('v0.js', () => {
        const input = 'https://cdn.ampproject.org/v0.js';
        const expected = 'https://cdn.ampproject.org/rtv/RTV123/v0.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0-module.js', () => {
        const input = 'https://cdn.ampproject.org/v0-module.js';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v0-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0.js', () => {
        const input = 'https://cdn.ampproject.org/v0.js';
        const expected = 'https://cdn.ampproject.org/rtv/RTV123/v0.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v1.js', () => {
        const input = 'https://cdn.ampproject.org/v1.js';
        const expected = 'https://cdn.ampproject.org/rtv/RTV123/v1.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v1-module.js', () => {
        const input = 'https://cdn.ampproject.org/v1-module.js';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v1-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v1.js', () => {
        const input = 'https://cdn.ampproject.org/v1.js';
        const expected = 'https://cdn.ampproject.org/rtv/RTV123/v1.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v20.js', () => {
        const input = 'https://cdn.ampproject.org/v20.js';
        const expected = 'https://cdn.ampproject.org/rtv/RTV123/v20.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v20-module.js', () => {
        const input = 'https://cdn.ampproject.org/v20-module.js';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v20-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v20.js', () => {
        const input = 'https://cdn.ampproject.org/v20.js';
        const expected = 'https://cdn.ampproject.org/rtv/RTV123/v20.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });
    });

    describe('extensions', () => {
      it('v0/amp-extension.js', () => {
        const input = 'https://cdn.ampproject.org/v0/amp-extension.js';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v0/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0/amp-extension-module.js', () => {
        const input = 'https://cdn.ampproject.org/v0/amp-extension-module.js';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v0/amp-extension-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0/amp-extension.js', () => {
        const input = 'https://cdn.ampproject.org/v0/amp-extension.js';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v0/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v1/amp-extension.js', () => {
        const input = 'https://cdn.ampproject.org/v1/amp-extension.js';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v1/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v1/amp-extension-module.js', () => {
        const input = 'https://cdn.ampproject.org/v1/amp-extension-module.js';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v1/amp-extension-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v1/amp-extension.js', () => {
        const input = 'https://cdn.ampproject.org/v1/amp-extension.js';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v1/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v1/amp-extension.js', () => {
        const input = 'https://cdn.ampproject.org/v1/amp-extension.js';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v1/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v1/amp-extension-module.js', () => {
        const input = 'https://cdn.ampproject.org/v1/amp-extension-module.js';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v1/amp-extension-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v1/amp-extension.js', () => {
        const input = 'https://cdn.ampproject.org/v1/amp-extension.js';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v1/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });
    });

    describe('rtvs', () => {
      it('rtv/010123456789123/v0.js', () => {
        const input = 'https://cdn.ampproject.org/rtv/010123456789123/v0.js';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v0.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0-module.js', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v0-module.js';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v0-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0.js', () => {
        const input = 'https://cdn.ampproject.org/rtv/010123456789123/v0.js';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v0.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v1.js', () => {
        const input = 'https://cdn.ampproject.org/rtv/010123456789123/v1.js';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v1.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v1-module.js', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v1-module.js';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v1-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v1.js', () => {
        const input = 'https://cdn.ampproject.org/rtv/010123456789123/v1.js';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v1.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v20.js', () => {
        const input = 'https://cdn.ampproject.org/rtv/010123456789123/v20.js';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v20.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v20-module.js', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v20-module.js';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v20-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v20.js', () => {
        const input = 'https://cdn.ampproject.org/rtv/010123456789123/v20.js';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v20.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0/amp-extension.js', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/amp-extension.js';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0/amp-extension-module.js', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/amp-extension-module.js';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/amp-extension-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0/amp-extension.js', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/amp-extension.js';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v1/amp-extension.js', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v1/amp-extension.js';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v1/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v1/amp-extension-module.js', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v1/amp-extension-module.js';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v1/amp-extension-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v1/amp-extension.js', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v1/amp-extension.js';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v1/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v20/amp-extension.js', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v20/amp-extension.js';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v20/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v20/amp-extension-module.js', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v20/amp-extension-module.js';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v20/amp-extension-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v20/amp-extension.js', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v20/amp-extension.js';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v20/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });
    });

    describe('mjs', () => {
      it('v0.mjs', () => {
        const input = 'https://cdn.ampproject.org/v0.mjs';
        const expected = 'https://cdn.ampproject.org/rtv/RTV123/v0.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0-module.mjs', () => {
        const input = 'https://cdn.ampproject.org/v0-module.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v0-module.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0.mjs', () => {
        const input = 'https://cdn.ampproject.org/v0.mjs';
        const expected = 'https://cdn.ampproject.org/rtv/RTV123/v0.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v1.mjs', () => {
        const input = 'https://cdn.ampproject.org/v1.mjs';
        const expected = 'https://cdn.ampproject.org/rtv/RTV123/v1.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v1-module.mjs', () => {
        const input = 'https://cdn.ampproject.org/v1-module.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v1-module.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v1.mjs', () => {
        const input = 'https://cdn.ampproject.org/v1.mjs';
        const expected = 'https://cdn.ampproject.org/rtv/RTV123/v1.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v20.mjs', () => {
        const input = 'https://cdn.ampproject.org/v20.mjs';
        const expected = 'https://cdn.ampproject.org/rtv/RTV123/v20.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v20-module.mjs', () => {
        const input = 'https://cdn.ampproject.org/v20-module.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v20-module.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v20.mjs', () => {
        const input = 'https://cdn.ampproject.org/v20.mjs';
        const expected = 'https://cdn.ampproject.org/rtv/RTV123/v20.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0/amp-extension.mjs', () => {
        const input = 'https://cdn.ampproject.org/v0/amp-extension.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v0/amp-extension.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0/amp-extension-module.mjs', () => {
        const input = 'https://cdn.ampproject.org/v0/amp-extension-module.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v0/amp-extension-module.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0/amp-extension.mjs', () => {
        const input = 'https://cdn.ampproject.org/v0/amp-extension.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v0/amp-extension.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v1/amp-extension.mjs', () => {
        const input = 'https://cdn.ampproject.org/v1/amp-extension.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v1/amp-extension.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v1/amp-extension-module.mjs', () => {
        const input = 'https://cdn.ampproject.org/v1/amp-extension-module.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v1/amp-extension-module.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v1/amp-extension.mjs', () => {
        const input = 'https://cdn.ampproject.org/v1/amp-extension.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v1/amp-extension.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v20/amp-extension.mjs', () => {
        const input = 'https://cdn.ampproject.org/v20/amp-extension.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v20/amp-extension.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v20/amp-extension-module.mjs', () => {
        const input = 'https://cdn.ampproject.org/v20/amp-extension-module.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v20/amp-extension-module.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v20/amp-extension.mjs', () => {
        const input = 'https://cdn.ampproject.org/v20/amp-extension.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v20/amp-extension.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0.mjs', () => {
        const input = 'https://cdn.ampproject.org/rtv/010123456789123/v0.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v0.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0-module.mjs', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v0-module.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v0-module.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0.mjs', () => {
        const input = 'https://cdn.ampproject.org/rtv/010123456789123/v0.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v0.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v1.mjs', () => {
        const input = 'https://cdn.ampproject.org/rtv/010123456789123/v1.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v1.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v1-module.mjs', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v1-module.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v1-module.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v1.mjs', () => {
        const input = 'https://cdn.ampproject.org/rtv/010123456789123/v1.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v1.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v20.mjs', () => {
        const input = 'https://cdn.ampproject.org/rtv/010123456789123/v20.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v20.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v20-module.mjs', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v20-module.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v20-module.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v20.mjs', () => {
        const input = 'https://cdn.ampproject.org/rtv/010123456789123/v20.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v20.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0/amp-extension.mjs', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/amp-extension.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/amp-extension.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0/amp-extension-module.mjs', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/amp-extension-module.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/amp-extension-module.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0/amp-extension.mjs', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/amp-extension.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/amp-extension.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v1/amp-extension.mjs', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v1/amp-extension.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v1/amp-extension.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v1/amp-extension-module.mjs', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v1/amp-extension-module.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v1/amp-extension-module.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v1/amp-extension.mjs', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v1/amp-extension.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v1/amp-extension.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v20/amp-extension.mjs', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v20/amp-extension.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v20/amp-extension.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v20/amp-extension-module.mjs', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v20/amp-extension-module.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v20/amp-extension-module.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v20/amp-extension.mjs', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v20/amp-extension.mjs';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v20/amp-extension.mjs.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });
    });

    describe('brotli', () => {
      it('v0.js.br', () => {
        const input = 'https://cdn.ampproject.org/v0.js.br';
        const expected = 'https://cdn.ampproject.org/rtv/RTV123/v0.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0-module.js.br', () => {
        const input = 'https://cdn.ampproject.org/v0-module.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v0-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0.js.br', () => {
        const input = 'https://cdn.ampproject.org/v0.js.br';
        const expected = 'https://cdn.ampproject.org/rtv/RTV123/v0.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v1.js.br', () => {
        const input = 'https://cdn.ampproject.org/v1.js.br';
        const expected = 'https://cdn.ampproject.org/rtv/RTV123/v1.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v1-module.js.br', () => {
        const input = 'https://cdn.ampproject.org/v1-module.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v1-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v1.js.br', () => {
        const input = 'https://cdn.ampproject.org/v1.js.br';
        const expected = 'https://cdn.ampproject.org/rtv/RTV123/v1.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v20.js.br', () => {
        const input = 'https://cdn.ampproject.org/v20.js.br';
        const expected = 'https://cdn.ampproject.org/rtv/RTV123/v20.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v20-module.js.br', () => {
        const input = 'https://cdn.ampproject.org/v20-module.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v20-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v20.js.br', () => {
        const input = 'https://cdn.ampproject.org/v20.js.br';
        const expected = 'https://cdn.ampproject.org/rtv/RTV123/v20.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0/amp-extension.js.br', () => {
        const input = 'https://cdn.ampproject.org/v0/amp-extension.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v0/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0/amp-extension-module.js.br', () => {
        const input =
          'https://cdn.ampproject.org/v0/amp-extension-module.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v0/amp-extension-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0/amp-extension.js.br', () => {
        const input = 'https://cdn.ampproject.org/v0/amp-extension.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v0/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v1/amp-extension.js.br', () => {
        const input = 'https://cdn.ampproject.org/v1/amp-extension.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v1/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v1/amp-extension-module.js.br', () => {
        const input =
          'https://cdn.ampproject.org/v1/amp-extension-module.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v1/amp-extension-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v1/amp-extension.js.br', () => {
        const input = 'https://cdn.ampproject.org/v1/amp-extension.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v1/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v20/amp-extension.js.br', () => {
        const input = 'https://cdn.ampproject.org/v20/amp-extension.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v20/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v20/amp-extension-module.js.br', () => {
        const input =
          'https://cdn.ampproject.org/v20/amp-extension-module.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v20/amp-extension-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v20/amp-extension.js.br', () => {
        const input = 'https://cdn.ampproject.org/v20/amp-extension.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v20/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0.js.br', () => {
        const input = 'https://cdn.ampproject.org/rtv/010123456789123/v0.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v0.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0-module.js.br', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v0-module.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v0-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0.js.br', () => {
        const input = 'https://cdn.ampproject.org/rtv/010123456789123/v0.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v0.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v1.js.br', () => {
        const input = 'https://cdn.ampproject.org/rtv/010123456789123/v1.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v1.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v1-module.js.br', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v1-module.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v1-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v1.js.br', () => {
        const input = 'https://cdn.ampproject.org/rtv/010123456789123/v1.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v1.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v20.js.br', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v20.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v20.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v20-module.js.br', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v20-module.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v20-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v20.js.br', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v20.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v20.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0/amp-extension.js.br', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/amp-extension.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0/amp-extension-module.js.br', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/amp-extension-module.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/amp-extension-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0/amp-extension.js.br', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/amp-extension.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v1/amp-extension.js.br', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v1/amp-extension.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v1/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v1/amp-extension-module.js.br', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v1/amp-extension-module.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v1/amp-extension-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v1/amp-extension.js.br', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v1/amp-extension.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v1/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v20/amp-extension.js.br', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v20/amp-extension.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v20/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v20/amp-extension-module.js.br', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v20/amp-extension-module.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v20/amp-extension-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v20/amp-extension.js.br', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v20/amp-extension.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v20/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0.js.br', () => {
        const input = 'https://cdn.ampproject.org/v0.js.br';
        const expected = 'https://cdn.ampproject.org/rtv/RTV123/v0.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0-module.js.br', () => {
        const input = 'https://cdn.ampproject.org/v0-module.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v0-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0.js.br', () => {
        const input = 'https://cdn.ampproject.org/v0.js.br';
        const expected = 'https://cdn.ampproject.org/rtv/RTV123/v0.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v1.js.br', () => {
        const input = 'https://cdn.ampproject.org/v1.js.br';
        const expected = 'https://cdn.ampproject.org/rtv/RTV123/v1.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v1-module.js.br', () => {
        const input = 'https://cdn.ampproject.org/v1-module.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v1-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v1.js.br', () => {
        const input = 'https://cdn.ampproject.org/v1.js.br';
        const expected = 'https://cdn.ampproject.org/rtv/RTV123/v1.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v20.js.br', () => {
        const input = 'https://cdn.ampproject.org/v20.js.br';
        const expected = 'https://cdn.ampproject.org/rtv/RTV123/v20.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v20-module.js.br', () => {
        const input = 'https://cdn.ampproject.org/v20-module.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v20-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v20.js.br', () => {
        const input = 'https://cdn.ampproject.org/v20.js.br';
        const expected = 'https://cdn.ampproject.org/rtv/RTV123/v20.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0/amp-extension.js.br', () => {
        const input = 'https://cdn.ampproject.org/v0/amp-extension.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v0/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0/amp-extension-module.js.br', () => {
        const input =
          'https://cdn.ampproject.org/v0/amp-extension-module.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v0/amp-extension-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0/amp-extension.js.br', () => {
        const input = 'https://cdn.ampproject.org/v0/amp-extension.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v0/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v1/amp-extension.js.br', () => {
        const input = 'https://cdn.ampproject.org/v1/amp-extension.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v1/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v1/amp-extension-module.js.br', () => {
        const input =
          'https://cdn.ampproject.org/v1/amp-extension-module.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v1/amp-extension-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v1/amp-extension.js.br', () => {
        const input = 'https://cdn.ampproject.org/v1/amp-extension.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v1/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v20/amp-extension.js.br', () => {
        const input = 'https://cdn.ampproject.org/v20/amp-extension.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v20/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v20/amp-extension-module.js.br', () => {
        const input =
          'https://cdn.ampproject.org/v20/amp-extension-module.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v20/amp-extension-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v20/amp-extension.js.br', () => {
        const input = 'https://cdn.ampproject.org/v20/amp-extension.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/RTV123/v20/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0.js.br', () => {
        const input = 'https://cdn.ampproject.org/rtv/010123456789123/v0.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v0.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0-module.js.br', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v0-module.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v0-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0.js.br', () => {
        const input = 'https://cdn.ampproject.org/rtv/010123456789123/v0.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v0.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v1.js.br', () => {
        const input = 'https://cdn.ampproject.org/rtv/010123456789123/v1.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v1.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v1-module.js.br', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v1-module.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v1-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v1.js.br', () => {
        const input = 'https://cdn.ampproject.org/rtv/010123456789123/v1.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v1.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v20.js.br', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v20.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v20.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v20-module.js.br', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v20-module.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v20-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v20.js.br', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v20.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v20.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0/amp-extension.js.br', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/amp-extension.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0/amp-extension-module.js.br', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/amp-extension-module.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/amp-extension-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0/amp-extension.js.br', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/amp-extension.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v1/amp-extension.js.br', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v1/amp-extension.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v1/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v1/amp-extension-module.js.br', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v1/amp-extension-module.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v1/amp-extension-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v1/amp-extension.js.br', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v1/amp-extension.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v1/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v20/amp-extension.js.br', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v20/amp-extension.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v20/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v20/amp-extension-module.js.br', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v20/amp-extension-module.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v20/amp-extension-module.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v20/amp-extension.js.br', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v20/amp-extension.js.br';
        const expected =
          'https://cdn.ampproject.org/rtv/010123456789123/v20/amp-extension.js.map';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });
    });

    describe('validator js', () => {
      it('v0/validator.js', () => {
        const input = 'https://cdn.ampproject.org/v0/validator.js';
        const expected = '';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0/validator-module.js', () => {
        const input = 'https://cdn.ampproject.org/v0/validator-module.js';
        const expected = '';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0/validator.js', () => {
        const input = 'https://cdn.ampproject.org/v0/validator.js';
        const expected = '';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0/validator.mjs', () => {
        const input = 'https://cdn.ampproject.org/v0/validator.mjs';
        const expected = '';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0/validator-module.mjs', () => {
        const input = 'https://cdn.ampproject.org/v0/validator-module.mjs';
        const expected = '';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0/validator.mjs', () => {
        const input = 'https://cdn.ampproject.org/v0/validator.mjs';
        const expected = '';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0/validator.js', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/validator.js';
        const expected = '';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0/validator-module.js', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/validator-module.js';
        const expected = '';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0/validator.js', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/validator.js';
        const expected = '';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0/validator.mjs', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/validator.mjs';
        const expected = '';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0/validator-module.mjs', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/validator-module.mjs';
        const expected = '';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0/validator.mjs', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/validator.mjs';
        const expected = '';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });
    });

    describe('experiments js', () => {
      it('v0/experiments.js', () => {
        const input = 'https://cdn.ampproject.org/v0/experiments.js';
        const expected = '';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0/experiments-module.js', () => {
        const input = 'https://cdn.ampproject.org/v0/experiments-module.js';
        const expected = '';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0/experiments.js', () => {
        const input = 'https://cdn.ampproject.org/v0/experiments.js';
        const expected = '';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0/experiments.mjs', () => {
        const input = 'https://cdn.ampproject.org/v0/experiments.mjs';
        const expected = '';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0/experiments-module.mjs', () => {
        const input = 'https://cdn.ampproject.org/v0/experiments-module.mjs';
        const expected = '';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('v0/experiments.mjs', () => {
        const input = 'https://cdn.ampproject.org/v0/experiments.mjs';
        const expected = '';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0/experiments.js', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/experiments.js';
        const expected = '';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0/experiments-module.js', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/experiments-module.js';
        const expected = '';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0/experiments.js', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/experiments.js';
        const expected = '';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0/experiments.mjs', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/experiments.mjs';
        const expected = '';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0/experiments-module.mjs', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/experiments-module.mjs';
        const expected = '';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });

      it('rtv/010123456789123/v0/experiments.mjs', () => {
        const input =
          'https://cdn.ampproject.org/rtv/010123456789123/v0/experiments.mjs';
        const expected = '';

        const actual = normalizeCdnJsUrl(input, 'RTV123');
        expect(actual).to.equal(expected);
      });
    });
  });
});
