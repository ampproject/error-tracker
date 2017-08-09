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
 * See the License for the specific language governing permissions andc
 * limitations under the License. Travis check
 */

const chai = require('chai');
const chaihttp = require('chai-http');
const mocha = require('mocha');
const statusCodes = require('http-status-codes');
const app = require('../app');
const sinon = require('sinon');
const stackTrace = require('../routes/error-tracker');
const log = require('../utils/log');
const describe = mocha.describe;
const beforeEach = mocha.beforeEach;
const afterEach = mocha.afterEach;
const it = mocha.it;
const expect = chai.expect;

process.env.NODE_ENV = 'test';
chai.use(chaihttp);

describe('Test how server responds to requests', function() {
  const sandbox = sinon.sandbox.create();
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
  const safariStackTrace = `file:///app/vendor.js:46140:60
	invokeTask@file:///app/vendor.js:45914:42
	onInvokeTask@file:///app/vendor.js:18559:47
	invokeTask@file:///app/vendor.js:45913:54
	runTask@file:///app/vendor.js:45814:57
	drainMicroTaskQueue@file:///app/vendor.js:46046:42
	promiseReactionJob@[native code]
	UIApplicationMain@[native code]
	start@file:///app/vendor.js:8354:30
	bootstrapApp@file:///app/vendor.js:60192:26
	bootstrapModuleFactory@file:///app/vendor.js:60173:26`;
  let randomVal = 1;
  beforeEach(function() {
    sandbox.stub(Math, 'random').callsFake(function() {
      return randomVal;
    });
    sandbox.stub(log, 'write').yields(null);
  });
  afterEach(function() {
    sandbox.restore();
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
      // chai-http errors with handling > 299 status codes hence errors can
      // only be asserted in the catch block which modifies anatomy of response
      // object. More information at
      // https://github.com/chaijs/chai-http/issues/75.
      // This is a hack and once the package has been updated is subject to
      // change
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
      // chai-http errors with handling > 299 status codes hence errors can
      // only be asserted in the catch block which modifies anatomy of response
      // object. More information at
      // https://github.com/chaijs/chai-http/issues/75.
      // This is a hack and once the package has been updated is subject to
      // change
      expect(res).to.have.status(statusCodes.BAD_REQUEST);
      expect(res.response).to.have.header('content-Type',
        'text/plain; charset=utf-8');
      expect(res.response.text).to.equal('IGNORE');
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
      // chai-http errors with handling > 299 status codes hence
      // errors can only be asserted in the catch block which
      // modifies anatomy of response
      // object. More information at https://github.com/chaijs/chai-http/issues/75.
      // This is a hack and once the package
      // has been updated is subject to change
      expect(res).to.have.property('status', statusCodes.BAD_REQUEST);
      expect(res.response.text).to.equal('IGNORE');
    });
  });

  it('Should not drop safari stack trace', function() {
    const output = ` at 	invokeTask (file:///app/vendor.js:45914:42)
 at 	onInvokeTask (file:///app/vendor.js:18559:47)
 at 	invokeTask (file:///app/vendor.js:45913:54)
 at 	runTask (file:///app/vendor.js:45814:57)
 at 	drainMicroTaskQueue (file:///app/vendor.js:46046:42)
 at 	start (file:///app/vendor.js:8354:30)
 at 	bootstrapApp (file:///app/vendor.js:60192:26)
 at 	bootstrapModuleFactory (file:///app/vendor.js:60173:26)`;
    query.a = 0;
    query.ca = 1;
    query['3p'] = 0;
    query.debug = 1;
    query.r = 'referer';
    query.s = safariStackTrace;
    query.m = 'Error: Local storage';
    randomVal = 0.00000000000000001;
    return chai.request(app).get('/r').query(query).then(function(res) {
      expect(res).to.have.status(statusCodes.OK);
      expect(res).to.have.header('Content-Type',
        'application/json; charset=utf-8');
      let payload = JSON.parse(res.text);
      expect(payload.event.serviceContext.version).includes('canary');
      expect(payload.message === 'OK\n');
      expect(payload.throttleRate).to.equal(1);
      expect(payload.event.message).to.equal(output);
    });
  });
});

describe('Test stacktrace conversions are done correctly', function() {
  const chromeStackTraceTestInput = `Error: localStorage not supported.
    at Error (native)
    at new vi (https://cdn.ampproject.org/rtv/031496877433269/v0.js:297:149)
    at new  (https://cdn.ampproject.org/rtv/031496877433269/v0.js:298:365)
    at dc (https://cdn.ampproject.org/rtv/031496877433269/v0.js:53:59)
    at I (https://cdn.ampproject.org/rtv/031496877433269/v0.js:51:626)
    at xi (https://cdn.ampproject.org/rtv/031496877433269/v0.js:298:278)
    at mf.zc (https://cdn.ampproject.org/rtv/031496877433269/v0.js:408:166)
    at pf (https://cdn.ampproject.org/rtv/031496877433269/v0.js:112:409)
    at lf.$d (https://cdn.ampproject.org/rtv/031496877433269/v0.js:115:86)
    at (https://cdn.ampproject.org/rtv/031496877433269/v0.js:114:188)`;
  const mozillaStackTraceTestInput = `Zd@https://cdn.ampproject.org/v0.js:5:204
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
    promiseReactionJob@[native code]`;
  const invalidStackTraceTestInput = `[native code]
    https://cdn.ampproject.org/v0.js:115:170
    promiseReactionJob@[native code]`;
  const formattedChromeStackTraceOutput =
      `    at new vi (https://cdn.ampproject.org/rtv/031496877433269/v0.js:297:149)
    at new  (https://cdn.ampproject.org/rtv/031496877433269/v0.js:298:365)
    at dc (https://cdn.ampproject.org/rtv/031496877433269/v0.js:53:59)
    at I (https://cdn.ampproject.org/rtv/031496877433269/v0.js:51:626)
    at xi (https://cdn.ampproject.org/rtv/031496877433269/v0.js:298:278)
    at mf.zc (https://cdn.ampproject.org/rtv/031496877433269/v0.js:408:166)
    at pf (https://cdn.ampproject.org/rtv/031496877433269/v0.js:112:409)
    at lf.$d (https://cdn.ampproject.org/rtv/031496877433269/v0.js:115:86)
    at (https://cdn.ampproject.org/rtv/031496877433269/v0.js:114:188)`;
  const formattedMozillaStackTraceOutput =
      ` at Zd (https://cdn.ampproject.org/v0.js:5:204)
 at     error (https://cdn.ampproject.org/v0.js:5:314)
 at     jh (https://cdn.ampproject.org/v0.js:237:205)
 at     dc (https://cdn.ampproject.org/v0.js:53:69)
 at     G (https://cdn.ampproject.org/v0.js:51:510)
 at     ph (https://cdn.ampproject.org/v0.js:245:131)
 at     dc (https://cdn.ampproject.org/v0.js:53:69)
 at     gc (https://cdn.ampproject.org/v0.js:52:43)
 at     bh (https://cdn.ampproject.org/v0.js:226:461)
 at     dc (https://cdn.ampproject.org/v0.js:53:69)
 at     I (https://cdn.ampproject.org/v0.js:51:628)
 at     pf (https://cdn.ampproject.org/v0.js:112:411)
 at     $d (https://cdn.ampproject.org/v0.js:115:88)`;

  it('Should leave chrome and chrome like stack traces as they are',
      function() {
        expect(stackTrace.standardizeStackTrace(chromeStackTraceTestInput)).
            to.equal(formattedChromeStackTraceOutput);
  });

  it('Should ignore stack traces with no line number and column number',
      function() {
        expect(stackTrace.standardizeStackTrace(invalidStackTraceTestInput))
            .to.equal('');
      }
  );

  it('Should convert safari and firefox stack traces to chrome like',
      function() {
        expect(stackTrace.standardizeStackTrace(mozillaStackTraceTestInput)).
            to.equal(formattedMozillaStackTraceOutput);
  });
});

describe('Test stacktrace are versioned correctly', function() {
  it('Should version v0.js urls', function() {
    const testInput = ` at new vi (https://cdn.ampproject.org/rtv/031496877433269/v0.js:297:149)
    at new  (https://cdn.ampproject.org/rtv/123/v0/amp-component.js:298:365)
    at dc (https://cdn.ampproject.org/rtv/031496877433269/v0.js:53:59)
    at Zd (https://cdn.ampproject.org/v0.js:5:204)
    at  error (https://cdn.ampproject.org/v0/amp-component.js:5:314)
    at  jh (https://cdn.ampproject.org/v0.js:237:205)
    at  dc (https://cdn.ampproject.org/v0.js:53:69) `;
    const testOutput = ` at new vi (https://cdn.ampproject.org/rtv/031496877433269/v0.js:297:149)
    at new  (https://cdn.ampproject.org/rtv/123/v0/amp-component.js:298:365)
    at dc (https://cdn.ampproject.org/rtv/031496877433269/v0.js:53:59)
    at Zd (https://cdn.ampproject.org/rtv/031496877433269/v0.js:5:204)
    at  error (https://cdn.ampproject.org/rtv/031496877433269/v0/amp-component.js:5:314)
    at  jh (https://cdn.ampproject.org/rtv/031496877433269/v0.js:237:205)
    at  dc (https://cdn.ampproject.org/rtv/031496877433269/v0.js:53:69) `;
    expect(stackTrace.versionStackTrace(testInput, '031496877433269'))
      .to.equal(testOutput);
  });
});

describe('Test non js stacktraces are identified', function() {
  const stack = `teteten@https://abc.cdn.ampproject.org/v/s/abc/doc?amp_js_v=0.1
global code@https://abc.cdn.ampproject.org/v/s/abc/doc?amp_js_v=0.1`;
  const chromeStackTraceTestInput = `at new vi (https://cdn.ampproject.org/rtv/031496877433269/v0.js:297:149)
    at new  (https://cdn.ampproject.org/rtv/031496877433269/v0.js:298:365)
    at dc (https://cdn.ampproject.org/rtv/031496877433269/v0.js:53:59)
    at I (https://cdn.ampproject.org/rtv/031496877433269/v0.js:51:626)
    at xi (https://cdn.ampproject.org/rtv/031496877433269/v0.js:298:278)
    at mf.zc (https://cdn.ampproject.org/rtv/031496877433269/v0.js:408:166)
    at pf (https://cdn.ampproject.org/rtv/031496877433269/v0.js:112:409)
    at lf.$d (https://cdn.ampproject.org/rtv/031496877433269/v0.js:115:86)
    at (https://cdn.ampproject.org/rtv/031496877433269/v0.js:114:188)`;
  it('Should identify non js stacktraces', function() {
    expect(stackTrace.isNonJSStackTrace(stack)).to.be.true;
    expect(stackTrace.isNonJSStackTrace(chromeStackTraceTestInput)).to.be.false;
  });
});
