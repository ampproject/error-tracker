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

import { standardizeStackTrace } from '../../utils/stacktrace/standardize-stack-trace.js';

describe('standardizeStackTrace', () => {
  describe('with a Chrome stack trace', () => {
    const frames = standardizeStackTrace(
      `Error: localStorage not supported.
      at Error (native)
      at new vi (https://cdn.ampproject.org/rtv/031496877433269/v0.js:297:149)
      at https://cdn.ampproject.org/rtv/031496877433269/v0.js:298:365
      at dc (https://cdn.ampproject.org/rtv/031496877433269/v0.js:53:59)
      at I (https://cdn.ampproject.org/rtv/031496877433269/v0.js:51:626)
      at xi (https://cdn.ampproject.org/rtv/031496877433269/v0.js:298:278)
      at mf.zc (https://cdn.ampproject.org/rtv/031496877433269/v0.js:408:166)
      at pf (https://cdn.ampproject.org/rtv/031496877433269/v0.js:112:409)
      at lf.$d (https://cdn.ampproject.org/rtv/031496877433269/v0.js:115:86)
      at https://cdn.ampproject.org/rtv/031496877433269/v0.js:114:188`,
      'Error: localStorage not supported.'
    );

    it('normalizes into 9 frames', () => {
      expect(frames).to.have.length(9);
    });

    it('extracts name context', () => {
      expect(frames[0].name).to.equal('new vi');
      expect(frames[2].name).to.equal('dc');
      expect(frames[3].name).to.equal('I');
      expect(frames[4].name).to.equal('xi');
      expect(frames[5].name).to.equal('mf.zc');
      expect(frames[6].name).to.equal('pf');
      expect(frames[7].name).to.equal('lf.$d');
    });

    it('extracts nameless frames', () => {
      expect(frames[1].name).to.equal('');
      expect(frames[8].name).to.equal('');
    });

    it('extracts source locations', () => {
      for (let i = 0; i < frames.length; i++) {
        expect(frames[i].source).to.equal(
          'https://cdn.ampproject.org/rtv/031496877433269/v0.js',
          `frame ${i}`
        );
      }
    });

    it('extracts line numbers', () => {
      expect(frames[0].line).to.equal(297);
      expect(frames[1].line).to.equal(298);
      expect(frames[2].line).to.equal(53);
      expect(frames[3].line).to.equal(51);
      expect(frames[4].line).to.equal(298);
      expect(frames[5].line).to.equal(408);
      expect(frames[6].line).to.equal(112);
      expect(frames[7].line).to.equal(115);
      expect(frames[8].line).to.equal(114);
    });

    it('extracts column numbers', () => {
      expect(frames[0].column).to.equal(149);
      expect(frames[1].column).to.equal(365);
      expect(frames[2].column).to.equal(59);
      expect(frames[3].column).to.equal(626);
      expect(frames[4].column).to.equal(278);
      expect(frames[5].column).to.equal(166);
      expect(frames[6].column).to.equal(409);
      expect(frames[7].column).to.equal(86);
      expect(frames[8].column).to.equal(188);
    });

    it('normalizes .js.br files to .js', () => {
      const frames = standardizeStackTrace(`Error: message
        at new v1 (https://cdn.ampproject.org/rtv/031496877433269/v0.js:297:149)
        at new v2 (https://cdn.ampproject.org/rtv/031496877433269/v0.js.br:297:149)
      `);
      expect(frames[0].source).to.equal(
        'https://cdn.ampproject.org/rtv/031496877433269/v0.js'
      );
      expect(frames[1].source).to.equal(
        'https://cdn.ampproject.org/rtv/031496877433269/v0.js'
      );
    });
  });

  describe('with a Safari stack trace', () => {
    const frames = standardizeStackTrace(
      `Zd@https://cdn.ampproject.org/v0.js:5:204
      error@https://cdn.ampproject.org/v0.js:5:314
      jh@https://cdn.ampproject.org/v0.js:237:205
      dc@https://cdn.ampproject.org/v0.js:53:69
      I@https://cdn.ampproject.org/v0.js:51:628
      https://cdn.ampproject.org/v0.js:408:173
      pf@https://cdn.ampproject.org/v0.js:112:411
      $d@https://cdn.ampproject.org/v0.js:115:88
      [native code]
      https://cdn.ampproject.org/v0.js:115:170
      promiseReactionJob@[native code]`,
      'Error doing something'
    );

    it('normalizes into 9 frames', () => {
      expect(frames).to.have.length(9);
    });

    it('extracts name context', () => {
      expect(frames[0].name).to.equal('Zd');
      expect(frames[1].name).to.equal('error');
      expect(frames[2].name).to.equal('jh');
      expect(frames[3].name).to.equal('dc');
      expect(frames[4].name).to.equal('I');
      expect(frames[6].name).to.equal('pf');
      expect(frames[7].name).to.equal('$d');
    });

    it('extracts nameless frames', () => {
      expect(frames[5].name).to.equal('');
      expect(frames[8].name).to.equal('');
    });

    it('extracts source locations', () => {
      for (let i = 0; i < frames.length; i++) {
        expect(frames[i].source).to.equal(
          'https://cdn.ampproject.org/v0.js',
          `frame ${i}`
        );
      }
    });

    it('extracts line numbers', () => {
      expect(frames[0].line).to.equal(5);
      expect(frames[1].line).to.equal(5);
      expect(frames[2].line).to.equal(237);
      expect(frames[3].line).to.equal(53);
      expect(frames[4].line).to.equal(51);
      expect(frames[5].line).to.equal(408);
      expect(frames[6].line).to.equal(112);
      expect(frames[7].line).to.equal(115);
      expect(frames[8].line).to.equal(115);
    });

    it('extracts column numbers', () => {
      expect(frames[0].column).to.equal(204);
      expect(frames[1].column).to.equal(314);
      expect(frames[2].column).to.equal(205);
      expect(frames[3].column).to.equal(69);
      expect(frames[4].column).to.equal(628);
      expect(frames[5].column).to.equal(173);
      expect(frames[6].column).to.equal(411);
      expect(frames[7].column).to.equal(88);
      expect(frames[8].column).to.equal(170);
    });

    it('normalizes .js.br files to .js', () => {
      const frames = standardizeStackTrace(`Error: message
        jh@https://cdn.ampproject.org/v0.js:237:205
        jh@https://cdn.ampproject.org/v0.js.br:237:205
      `);
      expect(frames[0].source).to.equal('https://cdn.ampproject.org/v0.js');
      expect(frames[1].source).to.equal('https://cdn.ampproject.org/v0.js');
    });
  });

  describe('empty stack traces', () => {
    it('inserts a missing frame for empty stacks', () => {
      const frames = standardizeStackTrace(``, 'Error: test');
      expect(frames.length).to.equal(1);
      expect(frames[0].name).to.equal('');
      expect(frames[0].source).to.equal('error-test.js');
      expect(frames[0].line).to.equal(1);
      expect(frames[0].column).to.equal(1);
    });

    it('generates unique filename based on message', () => {
      const frames = standardizeStackTrace(``, 'Daisy Daisy');
      expect(frames.length).to.equal(1);
      expect(frames[0].source).to.equal('daisy-daisy.js');
    });
  });
});
