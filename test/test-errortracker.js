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

const chai = require('chai');
const chaihttp = require('chai-http');
const mocha = require('mocha');
const statusCodes = require('http-status-codes');
const app = require('../app');
const sinon = require('sinon');
const describe = mocha.describe;
const before = mocha.before;
const after = mocha.after;
const expect = chai.expect;
const it = mocha.it;
const stackTrace = require('../routes/error-tracker');

process.env.NODE_ENV = 'test';
chai.use(chaihttp);

describe('Test how server responds to requests', function() {
  let query = {
    'l': 12,
    'a': 1,
    'rt': 'inabox',
    '3p': 1,
    'ca': 1,
    'ex': 1,
    's': 'exception',
    'm': 'message',
    'v': 'version',
    'el': 'classname',
    'r': 'referrer',
    'debug': 1,
  };
  let randomVal = 1;
  before(function() {
    sinon.stub(Math, 'random').callsFake(function() {
      return randomVal;
    });
  });

  after(function() {
    Math.random.restore();
  });

  it('Should ignore 99% of user errors', function() {
    randomVal = 1;
    query.a = 1;
    query.ca = 0;
    query.rt = '';
    query['3p'] = 0;
    query.s = '  at new vi (https://cdn.ampproject.org/rtv/031496877433269/v0.js:297:149)';
    return chai.request(app).get('/r').query(query).then(function(res) {
      expect(res).to.have.header('Content-Type', 'text/plain; charset=utf-8');
      expect(res).to.have.status(statusCodes.OK);
      expect(res.text).to.equal('THROTTLED\n');
    });
  });

  it('Should log 1% of user errors', function() {
    randomVal = 0.00000000000000001; // set sample to extremely small.
    query.a = 1;
    query.ca = 0;
    query.debug = 1;
    query.s = '  at new vi (https://cdn.ampproject.org/rtv/031496877433269/v0.js:297:149)';
    return chai.request(app).get('/r').query(query).then(function(res) {
      expect(res).to.have.status(statusCodes.OK);
      expect(res).to.have.header('Content-Type',
        'application/json; charset=utf-8');
      let payload = JSON.parse(res.text);
      expect(payload.event.serviceContext.version).to.includes('assert');
      expect(payload.message).to.equal('OK\n');
      expect(payload.throttleRate).to.equal(0.01);
    });
  });

  it('Should ignore 90% of 3p errors', function() {
    query['3p'] = 1;
    randomVal = 1;
    query.ca = 0;
    query.a = 0;
    query.debug = 1;
    query.rt = '';
    query.s = '  at new vi (https://cdn.ampproject.org/rtv/031496877433269/v0.js:297:149)';
    return chai.request(app).get('/r').query(query).then(function(res) {
      expect(res).to.have.status(statusCodes.OK);
      expect(res).to.have.header('Content-Type', 'text/plain; charset=utf-8');
      expect(res.text).to.equal('THROTTLED\n');
    });
  });

  it('Should log 10% of 3p errors', function() {
    query['3p'] = 1;
    randomVal = 0.00000000000000001;
    query.ca = 0;
    query.a = 0;
    query.debug = 1;
    query.rt = '';
    query.s = '  at new vi (https://cdn.ampproject.org/rtv/031496877433269/v0.js:297:149)';
    return chai.request(app).get('/r').query(query).then(function(res) {
      expect(res).to.have.status(statusCodes.OK);
      expect(res).to.have.header('Content-Type',
        'application/json; charset=utf-8');
      let payload = JSON.parse(res.text);
      expect(payload.event.serviceContext.version).to.includes('3p');
      expect(payload.message).to.includes('OK\n');
      expect(payload.throttleRate).to.equal(0.1);
    });
  });

  it('Should ignore 90% of cdn errors', function() {
    query['3p'] = 0;
    query.a = 0;
    query.ca = 0;
    query.debug = 1;
    query.r = 'https://cdn.ampproject.org/conferences';
    query.s = '  at new vi (https://cdn.ampproject.org/rtv/031496877433269/v0.js:297:149)';
    randomVal = 1;
    return chai.request(app).get('/r').query(query).then(function(res) {
      expect(res).to.have.status(statusCodes.OK);
      expect(res).to.have.header('Content-Type', 'text/plain; charset=utf-8');
      expect(res.text).to.equal('THROTTLED\n');
    });
  });

  it('Should log 10% of cdn errors', function() {
    query['3p'] = 0;
    query.a = 0;
    query.ca = 0;
    query.debug = 1;
    query.r = 'https://cdn.ampproject.org/conferences';
    query.s = '  at new vi (https://cdn.ampproject.org/rtv/031496877433269/v0.js:297:149)';
    randomVal = 0.00000000000000001;
    return chai.request(app).get('/r').query(query).then(function(res) {
      expect(res).to.have.status(statusCodes.OK);
      expect(res).to.have.header('Content-Type',
        'application/json; charset=utf-8');
      let payload = JSON.parse(res.text);
      expect(payload.event.serviceContext.version).includes('cdn');
      expect(payload.message === 'OK\n');
      expect(payload.throttleRate).to.equal(0.1);
    });
  });

  it('Should log all canary errors ', function() {
    query.a = 0;
    query.ca = 1;
    query['3p'] = 0;
    query.debug = 1;
    query.r = 'referer';
    query.s = '  at new vi (https://cdn.ampproject.org/rtv/031496877433269/v0.js:297:149)';
    randomVal = 0.00000000000000001;
    return chai.request(app).get('/r').query(query).then(function(res) {
      expect(res).to.have.status(statusCodes.OK);
      expect(res).to.have.header('Content-Type',
        'application/json; charset=utf-8');
      let payload = JSON.parse(res.text);
      expect(payload.event.serviceContext.version).includes('canary');
      expect(payload.message === 'OK\n');
      expect(payload.throttleRate).to.equal(1);
    });
  });

  it('Should not log errors missing exception and message', function() {
    randomVal = 0.00000000000000001;
    query.a = 0;
    query.ca = 1;
    query['3p'] = 0;
    query.s = '';
    query.m = '';
    query.debug = 1;
    query.r = 'referer';
    return chai.request(app).get('/r').query(query).then(function(res) {
      throw new Error('Unreachable');
    }, function(res) {
      /** chai-http errors with handling > 299 status codes hence errors can
       * only be asserted in the catch block which modifies anatomy of response
       * object. More information at
       * https://github.com/chaijs/chai-http/issues/75.
       * This is a hack and once the package has been updated is subject to
       * change
       **/
      expect(res).to.have.property('status', statusCodes.BAD_REQUEST);
      let payload = JSON.parse(res.response.text);
      expect(payload.error)
        .to.equal('One of \'message\' or \'exception\' must be present.');
    });
  });

  it('Should ignore testing traffic', function() {
    randomVal = 0.00000000000000001;
    query.a = 0;
    query.ca = 1;
    query['3p'] = 0;
    query.s = ' at new vi (https://cdn.ampproject.org/rtv/031496877433269/v0.js:297:149)';
    query.m = 'message';
    query.debug = 1;
    query.r = 'referer';
    query.m = 'message';
    query.v = '$internalRuntimeVersion$';
    return chai.request(app).get('/r').query(query).then(function(res) {
      expect(res).to.have.property('status', statusCodes.NO_CONTENT);
    });
  });

  it('Should ignore filtered messages or exceptions', function() {
    randomVal = 0.00000000000000001;
    query.a = 0;
    query.ca = 1;
    query['3p'] = 0;
    query.s = 'I null%20is%20not%20an%20object%20' +
        '(evaluating%20%27elt.parentNode%27) exception' +
        ' at new (https://cdn.ampproject.org/031496877433269/v0.js:298:365)';
    query.debug = 1;
    query.r = 'referer';
    query.m = 'I stop_youtube';
    query.v = 'version';
    return chai.request(app).get('/r').query(query).then(function(res) {
      throw new Error('Unreachable');
    }, function(res) {
      /** chai-http errors with handling > 299 status codes hence errors can
       * only be asserted in the catch block which modifies anatomy of response
       * object. More information at
       * https://github.com/chaijs/chai-http/issues/75.
       * This is a hack and once the package
       * has been updated is subject to change
       **/
      expect(res).to.have.status(statusCodes.BAD_REQUEST);
      expect(res.response).to.have.header('content-Type',
        'text/plain; charset=utf-8');
      expect(res.response.text).to.equal('IGNORE\n');
    });
  });

  it('Should ignore debug errors', function() {
    randomVal = 0.00000000000000001;
    query.a = 0;
    query.ca = 1;
    query['3p'] = 0;
    query.s = '  at new vi (https://cdn.ampproject.org/rtv/031496877433269/v0.js:297:149)';
    query.debug = 0;
    query.r = 'referer';
    query.m = 'message';
    return chai.request(app).get('/r').query(query).then(function(res) {
      expect(res).to.have.status(statusCodes.NO_CONTENT);
    });
  });

  it('Should not log exceptions with only invalid stacktraces', function() {
    randomVal = 0.00000000000000001;
    query.a = 0;
    query.ca = 1;
    query['3p'] = 0;
    query.s = 'exception@file.js';
    query.debug = 1;
    query.r = 'referer';
    query.m = 'message';
    return chai.request(app).get('/r').query(query).then(function(res) {
      throw new Error('Unreachable');
    }, function(res) {
      /** chai-http errors with handling > 299 status codes hence
       * errors can only be asserted in the catch block which
       * modifies anatomy of response
       * object. More information at https://github.com/chaijs/chai-http/issues/75.
       * This is a hack and once the package
       * has been updated is subject to change
       */
      expect(res).to.have.property('status', statusCodes.BAD_REQUEST);
      let payload = JSON.parse(res.response.text);
      expect(payload.error).to.equal('Exception must have a valid stack trace');
    });
  });
});

describe('Test stacktrace conversions are done correctly', function() {
  let testInput = [
    `Error: localStorage not supported.
    at Error (native)
    at new vi (https://cdn.ampproject.org/rtv/031496877433269/v0.js:297:149)
    at new  (https://cdn.ampproject.org/rtv/031496877433269/v0.js:298:365)
    at dc (https://cdn.ampproject.org/rtv/031496877433269/v0.js:53:59)
    at I (https://cdn.ampproject.org/rtv/031496877433269/v0.js:51:626)
    at xi (https://cdn.ampproject.org/rtv/031496877433269/v0.js:298:278)
    at mf.zc (https://cdn.ampproject.org/rtv/031496877433269/v0.js:408:166)
    at pf (https://cdn.ampproject.org/rtv/031496877433269/v0.js:112:409)
    at lf.$d (https://cdn.ampproject.org/rtv/031496877433269/v0.js:115:86)
    at https://cdn.ampproject.org/rtv/031496877433269/v0.js:114:188`,
    `Zd@https://cdn.ampproject.org/v0.js:5:204
    error@https://cdn.ampproject.org/v0.js:5:314
    jh@https://cdn.ampproject.org/v0.js:237:205
    dc@https://cdn.ampproject.org/v0.js:53:69
    G@https://cdn.ampproject.org/v0.js:51:510
    ph@https://cdn.ampproject.org/v0.js:245:131
    dc@https://cdn.ampproject.org/v0.js:53:69
    gc@https://cdn.ampproject.org/v0.js:52:43
    bh@https://cdn.ampproject.org/v0.js:226:461
    dc@https://cdn.ampproject.org/v0.js:53:69
    I@https://cdn.ampproject.org/v0.js:51:628
    https://cdn.ampproject.org/v0.js:408:173
    pf@https://cdn.ampproject.org/v0.js:112:411
    $d@https://cdn.ampproject.org/v0.js:115:88
    [native code]
    https://cdn.ampproject.org/v0.js:115:170
    promiseReactionJob@[native code]`,
    `[native code]
    https://cdn.ampproject.org/v0.js:115:170
    promiseReactionJob@[native code]`,
  ];
  let expectedTestOutput = [
    `at new vi (https://cdn.ampproject.org/rtv/031496877433269/v0.js:297:149)
    at new  (https://cdn.ampproject.org/rtv/031496877433269/v0.js:298:365)
    at dc (https://cdn.ampproject.org/rtv/031496877433269/v0.js:53:59)
    at I (https://cdn.ampproject.org/rtv/031496877433269/v0.js:51:626)
    at xi (https://cdn.ampproject.org/rtv/031496877433269/v0.js:298:278)
    at mf.zc (https://cdn.ampproject.org/rtv/031496877433269/v0.js:408:166)
    at pf (https://cdn.ampproject.org/rtv/031496877433269/v0.js:112:409)
    at lf.$d (https://cdn.ampproject.org/rtv/031496877433269/v0.js:115:86)
    at https://cdn.ampproject.org/rtv/031496877433269/v0.js:114:188`,
    ` at Zd https://cdn.ampproject.org/v0.js:5:204
 at     error https://cdn.ampproject.org/v0.js:5:314
 at     jh https://cdn.ampproject.org/v0.js:237:205
 at     dc https://cdn.ampproject.org/v0.js:53:69
 at     G https://cdn.ampproject.org/v0.js:51:510
 at     ph https://cdn.ampproject.org/v0.js:245:131
 at     dc https://cdn.ampproject.org/v0.js:53:69
 at     gc https://cdn.ampproject.org/v0.js:52:43
 at     bh https://cdn.ampproject.org/v0.js:226:461
 at     dc https://cdn.ampproject.org/v0.js:53:69
 at     I https://cdn.ampproject.org/v0.js:51:628
 at     pf https://cdn.ampproject.org/v0.js:112:411
 at     $d https://cdn.ampproject.org/v0.js:115:88`,
  ];

  it('Should leave chrome and chrome like stack traces as they are',
      function() {
        expect(stackTrace.stackTraceConversion(testInput[0])).
            to.equal(expectedTestOutput[0]);
  });

  it('Should ignore stack traces with no line number and column number',
      function() {
        expect(stackTrace.stackTraceConversion(testInput[2])).to.equal('');

      }
  );

  it('Should convert safari and firefox stack traces to chrome like',
      function() {
        expect(stackTrace.stackTraceConversion(testInput[1])).
            to.equal(expectedTestOutput[1]);
  });
});
