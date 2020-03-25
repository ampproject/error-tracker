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

const sinon = require('sinon');
const credentials = require('../../utils/credentials');
sinon.stub(credentials, 'getCredentials').resolves({
  client_email: 'email@project.aim.gserviceaccount.com',
  private_key:
    '-----BEGIN PRIVATE KEY-----\nblahblahblah\n-----END PRIVATE KEY-----',
});

const statusCodes = require('http-status-codes');
const app = require('../../app');
const logs = require('../../utils/log');
const Request = require('../../utils/requests/request');
const querystring = require('../../utils/requests/query-string');

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
      singlePassType: 'spt',
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

  function makePostRequest(type) {
    return function(referrer, query) {
      const q = makeQuery(query);
      return chai
        .request(server)
        .post('/r')
        .type(type)
        .set('Referer', referrer)
        .set('User-Agent', userAgent)
        .send(type === 'json' ? q : JSON.stringify(q));
    };
  }

  const referrer = 'https://cdn.ampproject.org/';
  const userAgent = 'Google Chrome blah blah version';
  const knownGoodQuery = Object.freeze({
    version: '011830043289240',
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
    mappings:
      'CAAC,IAAI,IAAM,SAAUA,GAClB,OAAOC,IAAID;' +
      'CCDb,IAAI,IAAM,SAAUE,GAClB,OAAOA',
  };
  function requestFake(url, callback) {
    Promise.resolve().then(() => {
      if (url.endsWith('.map')) {
        callback(null, null, JSON.stringify(rawSourceMap));
      } else {
        callback(
          null,
          null,
          JSON.stringify({
            ampRuntimeVersion: '011830043289240',
            diversions: ['001830043289240'],
          })
        );
      }
    });
  }
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
    sandbox = sinon.createSandbox({
      useFakeTimers: true,
    });
    clock = sandbox.clock;
    for (const key in logs) {
      sandbox.stub(logs[key], 'write').callsFake((entry, callback) => {
        Promise.resolve(null).then(callback);
      });
    }
    sandbox.stub(Request, 'request').callsFake((url, callback) => {
      Promise.reject(new Error('network disabled')).catch(callback);
    });
  });

  afterEach(() => {
    clock.tick(1e10);
    sandbox.restore();
  });

  testSuite('POST JSON', makePostRequest('json'));
  testSuite('POST Text', makePostRequest('text/plain'));

  function testSuite(description, makeRequest) {
    describe(description, () => {
      describe('rejects bad requests', () => {
        it('without referrer', () => {
          return makeRequest('', knownGoodQuery).then(res => {
            expect(res.text).to.equal('Bad Request');
          });
        });

        it('without version', () => {
          const query = Object.assign({}, knownGoodQuery, { version: '' });
          return makeRequest(referrer, query).then(res => {
            expect(res.text).to.equal('Bad Request');
          });
        });

        it('without error message', () => {
          const query = Object.assign({}, knownGoodQuery, { message: '' });
          return makeRequest(referrer, query).then(res => {
            expect(res.text).to.equal('Bad Request');
          });
        });

        it('with blacklisted error', () => {
          sandbox.stub(Math, 'random').returns(0);
          const query = Object.assign({}, knownGoodQuery, {
            message: 'stop_youtube',
          });

          return makeRequest(referrer, query).then(res => {
            expect(res.text).to.equal('Bad Request');
          });
        });
      });

      it('ignores development errors', () => {
        const query = Object.assign({}, knownGoodQuery, {
          version: '$internalRuntimeVersion$',
        });

        return makeRequest(referrer, query).then(res => {
          expect(res.status).to.equal(statusCodes.OK);
        });
      });

      describe('throttling', () => {
        it('does not throttle canary dev errors', () => {
          sandbox.stub(Math, 'random').returns(1);
          const query = Object.assign({}, knownGoodQuery, { canary: true });

          return makeRequest(referrer, query).then(res => {
            expect(res.status).to.equal(statusCodes.ACCEPTED);
          });
        });

        it('does not throttle "control" binary type errors', () => {
          sandbox.stub(Math, 'random').returns(1);
          const query = Object.assign({}, knownGoodQuery, {
            binaryType: 'control',
          });

          return makeRequest(referrer, query).then(res => {
            expect(res.status).to.equal(statusCodes.ACCEPTED);
          });
        });

        it('throttles 90% of canary user errors', () => {
          sandbox.stub(Math, 'random').returns(0.1);
          const query = Object.assign({}, knownGoodQuery, {
            canary: true,
            assert: true,
          });

          return makeRequest(referrer, query)
            .then(res => {
              expect(res.status).to.equal(statusCodes.ACCEPTED);
              Math.random.returns(0.11);
              return makeRequest(referrer, query);
            })
            .then(res => {
              expect(res.status).to.equal(statusCodes.OK);
            });
        });

        it('throttles 90% of dev errors', () => {
          sandbox.stub(Math, 'random').returns(0.1);

          return makeRequest(referrer, knownGoodQuery)
            .then(res => {
              expect(res.status).to.equal(statusCodes.ACCEPTED);
              Math.random.returns(0.11);
              return makeRequest(referrer, knownGoodQuery);
            })
            .then(res => {
              expect(res.status).to.equal(statusCodes.OK);
            });
        });

        it('throttles 99% of user errors', () => {
          sandbox.stub(Math, 'random').returns(0.01);
          const query = Object.assign({}, knownGoodQuery, {
            assert: true,
          });

          return makeRequest(referrer, query)
            .then(res => {
              expect(res.status).to.equal(statusCodes.ACCEPTED);
              Math.random.returns(0.02);
              return makeRequest(referrer, query);
            })
            .then(res => {
              expect(res.status).to.equal(statusCodes.OK);
            });
        });

        describe('handles single pass experiment', () => {
          it('should detect single pass type', () => {
            const query = Object.assign({}, knownGoodQuery, {
              stack: '',
              canary: true,
              debug: true,
              singlePassType: 'sp',
            });

            return makeRequest(referrer, query).then(res => {
              expect(res.body.event.serviceContext.service).to.be.equal(
                'default-sp-cdn-1p-canary'
              );
            });
          });

          it('should detect multi pass type', () => {
            const query = Object.assign({}, knownGoodQuery, {
              stack: '',
              canary: true,
              debug: true,
              singlePassType: 'mp',
            });

            return makeRequest(referrer, query).then(res => {
              expect(res.body.event.serviceContext.service).to.be.equal(
                'default-mp-cdn-1p-canary'
              );
            });
          });

          it('should detect esm type', () => {
            const query = Object.assign({}, knownGoodQuery, {
              stack: '',
              canary: true,
              debug: true,
              singlePassType: 'esm',
            });

            return makeRequest(referrer, query).then(res => {
              expect(res.body.event.serviceContext.service).to.be.equal(
                'default-esm-cdn-1p-canary'
              );
            });
          });

          it('should ignore empty single pass type', () => {
            const query = Object.assign({}, knownGoodQuery, {
              stack: '',
              canary: true,
              debug: true,
              singlePassType: '',
            });

            return makeRequest(referrer, query).then(res => {
              expect(res.body.event.serviceContext.service).to.be.equal(
                'default-cdn-1p-canary'
              );
            });
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
              expect(res.body.event.serviceContext.service).to.be.equal(
                'default-cdn-1p-canary'
              );
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
              expect(res.body.event.serviceContext.service).to.be.equal(
                'default-cdn-1p'
              );
            });
          });

          it('should allow any binary type', () => {
            const query = Object.assign({}, knownGoodQuery, {
              stack: '',
              debug: true,
              binaryType: 'hello-world',
            });
            return makeRequest(referrer, query).then(res => {
              expect(res.body.event.serviceContext.service).to.be.equal(
                'default-cdn-1p-hello-world'
              );
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
            return makeRequest(referrer, query).then(res => {
              const { httpRequest } = res.body.event.context;
              expect(httpRequest.url).to.be.equal(
                '/r?v=011830043289240&m=The%20object%20does%20' +
                  'not%20support%20the%20operation%20or%20argument.&a=0&rt=1p' +
                  '&s=&debug=1'
              );
              expect(httpRequest.userAgent).to.be.equal(userAgent);
              expect(httpRequest.referrer).to.be.equal(referrer);
            });
          });

          it('logs missing stack trace', () => {
            return makeRequest(referrer, query).then(res => {
              expect(res.body.event.message).to.be.equal(
                `Error: ${query.message}\n    at ` +
                  'the-object-does-not-support-the-operation-or-argument.js:1:1'
              );
            });
          });
        });

        describe('safari stack traces', () => {
          const query = Object.assign({}, knownGoodQuery, {
            stack:
              't@https://cdn.ampproject.org/v0.js:1:18\n' +
              'https://cdn.ampproject.org/v0.js:2:18',
            debug: true,
          });

          it('logs http request', () => {
            return makeRequest(referrer, query).then(res => {
              const { httpRequest } = res.body.event.context;
              expect(httpRequest.url).to.be.equal(
                '/r?v=011830043289240&m=The%20object%20does%20' +
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
              return makeRequest(referrer, query).then(res => {
                expect(res.body.event.message).to.be.equal(
                  'Error: The object does not support the operation or argument.\n' +
                    '    at t (https://cdn.ampproject.org/v0.js:1:18)\n' +
                    '    at https://cdn.ampproject.org/v0.js:2:18'
                );
              });
            });
          });

          describe('when unminification succeeds', () => {
            beforeEach(() => {
              Request.request.callsFake(requestFake);
            });

            it('logs full error', () => {
              return makeRequest(referrer, query).then(res => {
                expect(res.body.event.message).to.be.equal(
                  'Error: The object does not support the operation or argument.\n' +
                    '    at bar (https://cdn.ampproject.org/one.js:1:21)\n' +
                    '    at n (https://cdn.ampproject.org/two.js:1:21)'
                );
              });
            });
          });
        });

        describe('chrome stack traces', () => {
          const query = Object.assign({}, knownGoodQuery, {
            stack:
              `${knownGoodQuery.message}\n` +
              '    at t (https://cdn.ampproject.org/v0.js:1:18)\n' +
              '    at https://cdn.ampproject.org/v0.js:2:18',
            debug: true,
          });

          it('logs http request', () => {
            return makeRequest(referrer, query).then(res => {
              const { httpRequest } = res.body.event.context;
              expect(httpRequest.url).to.be.equal(
                '/r?v=011830043289240&m=The%20object%20does%20' +
                  'not%20support%20the%20operation%20or%20argument.&a=0&rt=1p' +
                  '&s=The%20object%20does%20not%20support%20the%20operation%20or' +
                  '%20argument.%0A%20%20%20%20at%20t%20(https%3A%2F%2Fcdn.ampproject.org' +
                  '%2Fv0.js%3A1%3A18)%0A%20%20%20%20at%20https%3A%2F%2Fcdn.ampproject.' +
                  'org%2Fv0.js%3A2%3A18&debug=1'
              );
              expect(httpRequest.userAgent).to.be.equal(userAgent);
              expect(httpRequest.referrer).to.be.equal(referrer);
            });
          });

          describe('when unminification fails', () => {
            it('logs full error', () => {
              return makeRequest(referrer, query).then(res => {
                expect(res.body.event.message).to.be.equal(
                  'Error: The object does not support the operation or argument.\n' +
                    '    at t (https://cdn.ampproject.org/v0.js:1:18)\n' +
                    '    at https://cdn.ampproject.org/v0.js:2:18'
                );
              });
            });
          });

          describe('when unminification succeeds', () => {
            beforeEach(() => {
              Request.request.callsFake(requestFake);
            });

            it('logs full error', () => {
              return makeRequest(referrer, query).then(res => {
                expect(res.body.event.message).to.be.equal(
                  'Error: The object does not support the operation or argument.\n' +
                    '    at bar (https://cdn.ampproject.org/one.js:1:21)\n' +
                    '    at n (https://cdn.ampproject.org/two.js:1:21)'
                );
              });
            });
          });
        });
      });
    });
  }
});
