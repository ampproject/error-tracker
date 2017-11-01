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
 * limitations under the License.
 */

const statusCodes = require('http-status-codes');
const winston = require('winston');
const app = require('../../app');
const log = require('../../utils/log');
const Request = require('../../utils/request');

describe('Error Tracker Server', () => {
  const makeQuery = (function() {
    const mappings = {
      version: 'v',
      message: 'm',
      stack: 's',
      runtime: 'rt',
      assert: 'a',
      canary: 'ca',
      expected: 'ex',
      debug: 'debug',
      thirdParty: '3p',
      binaryType: 'bt',
    };
    const booleans = ['assert', 'canary', 'expected', 'debug', 'thirdParty'];

    return function makeQuery(options) {
      const query = {};
      for (const prop in options) {
        let value;
        if (booleans.includes(prop)) {
          value = options[prop] ? '1' : '0';
        } else {
          value = options[prop];
        }
        query[mappings[prop]] = value;
      }

      return query;
    };
  })();

  function makeRequest(referrer, query) {
    return chai.request(server)
        .get('/r')
        .set('Referer', referrer)
        .set('User-Agent', userAgent)
        .query(makeQuery(query));
  }

  const referrer = 'https://cdn.ampproject.org/';
  const userAgent = 'Google Chrome blah blah version';
  const knownGoodQuery = Object.freeze({
    version: '011502819823157',
    // chai.request will encode this for us.
    message: 'The object does not support the operation or argument.',
    assert: false,
    runtime: '1p',
    // chai.request will encode this for us.
    stack: 'Error: stuff\n at file.js:1:2\n at n (file2.js:3:4)',
  });
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
  let sandbox;
  let clock;
  let server;

  before(() => {
    server = app.listen(0);
  });
  after(() => {
    server.close();
  });

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    clock = sandbox.useFakeTimers();
    sandbox.stub(winston, 'error').yields(null);
    sandbox.stub(log, 'write').callsFake((entry, callback) => {
      Promise.resolve(null).then(callback);
    });
    sandbox.stub(Request, 'request').callsFake((url, callback) => {
      Promise.reject(new Error('network disabled')).catch(callback);
    });
  });

  afterEach(() => {
    clock.tick(1e10);
    sandbox.restore();
  });

  describe('rejects bad requests', () => {
    it('without referrer', () => {
      return makeRequest('', knownGoodQuery).then(() => {
        throw new Error('UNREACHABLE');
      }, (err) => {
        expect(err.message).to.equal('Bad Request');
      });
    });

    it('without version', () => {
      const query = Object.assign({}, knownGoodQuery, {version: ''});
      return makeRequest(referrer, query).then(() => {
        throw new Error('UNREACHABLE');
      }, (err) => {
        expect(err.message).to.equal('Bad Request');
      });
    });

    it('without error message', () => {
      const query = Object.assign({}, knownGoodQuery, {message: ''});
      return makeRequest(referrer, query).then(() => {
        throw new Error('UNREACHABLE');
      }, (err) => {
        expect(err.message).to.equal('Bad Request');
      });
    });

    it('with blacklisted error', () => {
      sandbox.stub(Math, 'random').returns(0);
      const query = Object.assign({}, knownGoodQuery, {
        message: 'stop_youtube',
      });

      return makeRequest(referrer, query).then(() => {
        throw new Error('UNREACHABLE');
      }, (err) => {
        expect(err.message).to.equal('Bad Request');
      });
    });
  });

  it('ignores development errors', () => {
    const query = Object.assign({}, knownGoodQuery, {
      version: '$internalRuntimeVersion$',
    });

    return makeRequest(referrer, query).then((res) => {
      expect(res.status).to.equal(statusCodes.OK);
      expect(log.write.callCount).to.equal(0);
      expect(Request.request.callCount).to.equal(0);
    });
  });

  describe('throttling', () => {
    it('does not throttle canary dev errors', () => {
      sandbox.stub(Math, 'random').returns(1);
      const query = Object.assign({}, knownGoodQuery, {canary: '1'});

      return makeRequest(referrer, query).then((res) => {
        expect(res.status).to.equal(statusCodes.ACCEPTED);
      });
    });

    it('does not throttle "control" binary type errors', () => {
      sandbox.stub(Math, 'random').returns(1);
      const query = Object.assign({}, knownGoodQuery, {binaryType: 'control'});

      return makeRequest(referrer, query).then((res) => {
        expect(res.status).to.equal(statusCodes.ACCEPTED);
      });
    });

    it('throttles 90% of canary user errors', () => {
      sandbox.stub(Math, 'random').returns(0.1);
      const query = Object.assign({}, knownGoodQuery, {
        canary: true,
        assert: true,
      });

      return makeRequest(referrer, query).then((res) => {
        expect(res.status).to.equal(statusCodes.ACCEPTED);
        Math.random.returns(0.11);
        return makeRequest(referrer, query);
      }).then((res) => {
        expect(res.status).to.equal(statusCodes.OK);
      });
    });

    it('throttles 90% of dev errors', () => {
      sandbox.stub(Math, 'random').returns(0.1);

      return makeRequest(referrer, knownGoodQuery).then((res) => {
        expect(res.status).to.equal(statusCodes.ACCEPTED);
        Math.random.returns(0.11);
        return makeRequest(referrer, knownGoodQuery);
      }).then((res) => {
        expect(res.status).to.equal(statusCodes.OK);
      });
    });

    it('throttles 99% of user errors', () => {
      sandbox.stub(Math, 'random').returns(0.01);
      const query = Object.assign({}, knownGoodQuery, {
        assert: true,
      });

      return makeRequest(referrer, query).then((res) => {
        expect(res.status).to.equal(statusCodes.ACCEPTED);
        Math.random.returns(0.02);
        return makeRequest(referrer, query);
      }).then((res) => {
        expect(res.status).to.equal(statusCodes.OK);
      });
    });

    describe('handles binary type and canary flags', () => {
      beforeEach(() => {
        sandbox.stub(Math, 'random').returns(0);
      });

      it('should use canary', () => {
        const query = Object.assign({}, knownGoodQuery, {
          stack: '',
          canary: true,
          debug: true,
        });

        return makeRequest(referrer, query).then(res => {
          expect(res.body.event.serviceContext.service)
              .to.be.equal('default-cdn-1p-canary');
        });
      });

      it('should use binary type and take priority over canary flag', () => {
        const query = Object.assign({}, knownGoodQuery, {
          stack: '',
          // "canary" state should be ignored since `bt` should take precedence.
          canary: true,
          debug: true,
          binaryType: 'production',
        });
        return makeRequest(referrer, query).then(res => {
          expect(res.body.event.serviceContext.service)
              .to.be.equal('default-cdn-1p');
        });
      });

      it('should allow any binary type', () => {
        const query = Object.assign({}, knownGoodQuery, {
          stack: '',
          debug: true,
          binaryType: 'hello-world',
        });
        return makeRequest(referrer, query).then(res => {
          expect(res.body.event.serviceContext.service)
              .to.be.equal('default-cdn-1p-hello-world');
        });
      });
    });
  });

  describe('logging errors', () => {
    beforeEach(() => {
      sandbox.stub(Math, 'random').returns(0);
    });

    describe('empty stack traces', () => {
      const query = Object.assign({}, knownGoodQuery, {
        stack: '',
        debug: true,
      });

      it('logs http request', () => {
        return makeRequest(referrer, query).then((res) => {
          const {httpRequest} = res.body.event.context;
          expect(httpRequest.url).to.be.equal(
            '/r?v=011502819823157&m=The%20object%20does%20' +
              'not%20support%20the%20operation%20or%20argument.&a=0&rt=1p' +
              '&s=&debug=1'
          );
          expect(httpRequest.userAgent).to.be.equal(userAgent);
          expect(httpRequest.referrer).to.be.equal(referrer);
        });
      });

      it('logs normalized message only', () => {
        return makeRequest(referrer, query).then((res) => {
          expect(res.body.event.message).to.be.equal(`Error: ${query.message}`);
        });
      });
    });

    describe('safari stack traces', () => {
      const query = Object.assign({}, knownGoodQuery, {
        stack: 't@https://cdn.ampproject.org/v0.js:1:18\n' +
            'https://cdn.ampproject.org/v0.js:2:18',
        debug: true,
      });

      it('logs http request', () => {
        return makeRequest(referrer, query).then((res) => {
          const {httpRequest} = res.body.event.context;
          expect(httpRequest.url).to.be.equal(
            '/r?v=011502819823157&m=The%20object%20does%20' +
              'not%20support%20the%20operation%20or%20argument.&a=0&rt=1p' +
              '&s=t%40https%3A%2F%2Fcdn.ampproject.org%2Fv0.js%3A1%3A18%0A' +
              'https%3A%2F%2Fcdn.ampproject.org%2Fv0.js%3A2%3A18&debug=1'
          );
          expect(httpRequest.userAgent).to.be.equal(userAgent);
          expect(httpRequest.referrer).to.be.equal(referrer);
        });
      });

      describe('when unminification fails', () => {
        it('logs full error', () => {
          return makeRequest(referrer, query).then((res) => {
            expect(res.body.event.message).to.be.equal(
              'Error: The object does not support the operation or argument.\n' +
                '    at t (https://cdn.ampproject.org/v0.js:1:18)\n' +
                '    at https://cdn.ampproject.org/v0.js:2:18');
          });
        });
      });

      describe('when unminification succeeds', () => {
        beforeEach(() => {
          Request.request.callsFake((url, callback) => {
            Promise.resolve().then(() => {
              callback(null, null, JSON.stringify(rawSourceMap));
            });
          });
        });

        it('logs full error', () => {
          return makeRequest(referrer, query).then((res) => {
            expect(res.body.event.message).to.be.equal(
              'Error: The object does not support the operation or argument.\n' +
                '    at bar (https://cdn.ampproject.org/one.js:1:21)\n' +
                '    at n (https://cdn.ampproject.org/two.js:1:21)');
          });
        });
      });
    });

    describe('chrome stack traces', () => {
      const query = Object.assign({}, knownGoodQuery, {
        stack: `${knownGoodQuery.message}\n` +
            '    at t (https://cdn.ampproject.org/v0.js:1:18)\n' +
            '    at https://cdn.ampproject.org/v0.js:2:18',
        debug: true,
      });

      it('logs http request', () => {
        return makeRequest(referrer, query).then((res) => {
          const {httpRequest} = res.body.event.context;
          expect(httpRequest.url).to.be.equal(
            '/r?v=011502819823157&m=The%20object%20does%20' +
              'not%20support%20the%20operation%20or%20argument.&a=0&rt=1p' +
              '&s=The%20object%20does%20not%20support%20the%20operation%20or' +
              '%20argument.%0A%20%20%20%20at%20t%20%28https%3A%2F%2Fcdn.ampproject.org' +
              '%2Fv0.js%3A1%3A18%29%0A%20%20%20%20at%20https%3A%2F%2Fcdn.ampproject.' +
              'org%2Fv0.js%3A2%3A18&debug=1'
          );
          expect(httpRequest.userAgent).to.be.equal(userAgent);
          expect(httpRequest.referrer).to.be.equal(referrer);
        });
      });

      describe('when unminification fails', () => {
        it('logs full error', () => {
          return makeRequest(referrer, query).then((res) => {
            expect(res.body.event.message).to.be.equal(
              'Error: The object does not support the operation or argument.\n' +
                '    at t (https://cdn.ampproject.org/v0.js:1:18)\n' +
                '    at https://cdn.ampproject.org/v0.js:2:18');
          });
        });
      });

      describe('when unminification succeeds', () => {
        beforeEach(() => {
          Request.request.callsFake((url, callback) => {
            Promise.resolve().then(() => {
              callback(null, null, JSON.stringify(rawSourceMap));
            });
          });
        });

        it('logs full error', () => {
          return makeRequest(referrer, query).then((res) => {
            expect(res.body.event.message).to.be.equal(
              'Error: The object does not support the operation or argument.\n' +
                '    at bar (https://cdn.ampproject.org/one.js:1:21)\n' +
                '    at n (https://cdn.ampproject.org/two.js:1:21)');
          });
        });
      });
    });
  });
});
