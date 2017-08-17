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

const sourceMap = require('source-map');
const unminify = require('../../utils/unminify');
const Request = require('../../utils/request');
const Frame = require('../../utils/frame');

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
    mappings: 'CAAC,IAAI,IAAM,SAAUA,GAClB,OAAOC,IAAID;' +
        'CCDb,IAAI,IAAM,SAAUE,GAClB,OAAOA',
  };
  const frame1 = new Frame('foo', 'https://cdn.ampproject.org/v0.js', '1',
      '18');
  const frame2 = new Frame('bar', 'https://cdn.ampproject.org/v0.js', '1',
      '24');
  const frame3 = new Frame('baz', 'https://cdn.ampproject.org/v1.js', '2',
      '18');
  const versionedFrame = new Frame('test',
      'https://cdn.ampproject.org/rtv/001502924683165/v0.js', '1', '2');
  const nonCdnFrame = new Frame('test', 'http://other.com/v0.js', '1', '2');

  let sandbox;
  let clock;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    clock = sandbox.useFakeTimers();
    sandbox.stub(Request, 'request').callsFake((url, callback) => {
      setTimeout(() => {
        callback(null, null, JSON.stringify(rawSourceMap));
      }, 10);
    });
  });

  afterEach(() => {
    // Expired all cached sourcemaps
    clock.tick(1e10);
    sandbox.restore();
  });

  it('unminifies multiple frames (same file)', () => {
    const p = unminify([frame1, frame2], '123');
    clock.tick(100);
    return p.then((unminified) => {
      expect(Request.request.callCount).to.equal(1);

      const f1 = unminified[0];
      expect(f1.source).to.equal('https://cdn.ampproject.org/one.js');
      expect(f1.line).to.equal(1);
      expect(f1.column).to.equal(21);
      const f2 = unminified[1];
      expect(f2.source).to.equal('https://cdn.ampproject.org/one.js');
      expect(f2.line).to.equal(2);
      expect(f2.column).to.equal(3);
    });
  });

  it('unminifies multiple frames (multiple files)', () => {
    const p = unminify([frame1, frame3], '123');
    clock.tick(100);
    return p.then((unminified) => {
      expect(Request.request.callCount).to.equal(2);

      const f1 = unminified[0];
      expect(f1.source).to.equal('https://cdn.ampproject.org/one.js');
      expect(f1.line).to.equal(1);
      expect(f1.column).to.equal(21);
      const f2 = unminified[1];
      expect(f2.source).to.equal('https://cdn.ampproject.org/two.js');
      expect(f2.line).to.equal(1);
      expect(f2.column).to.equal(21);
    });
  });

  it('does not unminify non-cdn js files', () => {
    const p = unminify([frame1, nonCdnFrame], '123');
    clock.tick(100);
    return p.then((unminified) => {
      expect(Request.request.callCount).to.equal(1);

      const f1 = unminified[0];
      expect(f1.source).to.equal('https://cdn.ampproject.org/one.js');
      expect(f1.line).to.equal(1);
      expect(f1.column).to.equal(21);
      const f2 = unminified[1];
      expect(f2.source).to.equal(nonCdnFrame.source);
      expect(f2.line).to.equal(nonCdnFrame.line);
      expect(f2.column).to.equal(nonCdnFrame.column);
    });
  });

  it('does not request same file twice (same stack)', () => {
    const p = unminify([frame1, frame2], '123');
    clock.tick(100);
    return p.then((unminified) => {
      expect(Request.request.callCount).to.equal(1);
    });
  });

  it('does not request same file twice (consecutive stacks)', () => {
    const p = unminify([frame1], '123');
    const p2 = unminify([frame2], '123');
    clock.tick(100);
    return Promise.all([p, p2]).then(() => {
      expect(Request.request.callCount).to.equal(1);
    });
  });

  it('does not request same file twice (after response)', () => {
    const p = unminify([frame1], '123');
    clock.tick(100);
    return p.then(() => {
      const p2 = unminify([frame2], '123');
      clock.tick(100);
      return p2;
    }).then(() => {
      expect(Request.request.callCount).to.equal(1);
    });
  });

  it('requests file twice after purge', () => {
    const p = unminify([frame1], '123');
    clock.tick(100);
    return p.then(() => {
      clock.tick(1e10);
      const p2 = unminify([frame2], '123');
      clock.tick(100);
      return p2;
    }).then(() => {
      expect(Request.request.callCount).to.equal(2);
    });
  });

  it('normalizes unversioned files into rtv version', () => {
    const p = unminify([frame1], '123');
    clock.tick(100);
    return p.then(() => {
      const p2 = unminify([frame2], '124');
      clock.tick(100);
      return p2;
    }).then(() => {
      expect(Request.request.callCount).to.equal(2);
      expect(Request.request.getCall(0).args[0]).to.equal(
        'https://cdn.ampproject.org/rtv/123/v0.js.map'
      );
      expect(Request.request.getCall(1).args[0]).to.equal(
        'https://cdn.ampproject.org/rtv/124/v0.js.map'
      );
    });
  });

  it('does not normalize versioned files', () => {
    debugger;
    const p = unminify([frame1, versionedFrame], '123');
    clock.tick(100);
    return p.then(() => {
      // expect(Request.request.callCount).to.equal(2);
      expect(Request.request.getCall(0).args[0]).to.equal(
        'https://cdn.ampproject.org/rtv/123/v0.js.map'
      );
      expect(Request.request.getCall(1).args[0]).to.equal(
        'https://cdn.ampproject.org/rtv/001502924683165/v0.js.map'
      );
    });
  });
});
