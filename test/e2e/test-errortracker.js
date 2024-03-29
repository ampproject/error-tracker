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

import { Log } from '@google-cloud/logging';
import { StatusCodes } from 'http-status-codes';

import app from '../../app.js';
import nock from 'nock';
import superagent from 'superagent';

describe('Error Tracker Server', () => {
  const makeQuery = (function () {
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
      prethrottled: 'pt',
      singlePassType: 'spt',
    };
    const booleans = [
      'assert',
      'canary',
      'expected',
      'debug',
      'thirdParty',
      'prethrottled',
    ];

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
    return function (referrer, query) {
      const q = makeQuery(query);
      return superagent
        .post(`http://127.0.0.1:${server.address().port}/r`)
        .ok(() => true)
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
    binaryType: 'production',
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

  /** @type {sinon.SinonSandbox} */
  let sandbox;
  /** @type {sinon.SinonFakeTimers} */
  let clock;
  /** @type {import('node:http').Server} */
  let server;

  before(() => {
    server = app.listen(0);
  });
  after(() => {
    server.close();
  });

  beforeEach(async () => {
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');

    sandbox = sinon.createSandbox({
      useFakeTimers: true,
    });
    clock = sandbox.clock;
    sandbox.stub(Log.prototype, 'write').resolves();
  });

  afterEach(async () => {
    await clock.tickAsync(1e10);

    sandbox.restore();

    expect(nock.pendingMocks()).to.be.empty;
    nock.cleanAll();
  });

  testSuite('POST JSON', makePostRequest('json'));
  testSuite('POST Text', makePostRequest('text/plain'));

  function testSuite(description, makeRequest) {
    describe(description, () => {
      describe('rejects bad requests', () => {
        it('without referrer', async () => {
          const { text } = await makeRequest('', knownGoodQuery);
          expect(text).to.equal('Bad Request');
        });

        it('without version', async () => {
          const query = Object.assign({}, knownGoodQuery, { version: '' });
          const { text } = await makeRequest(referrer, query);
          expect(text).to.equal('Bad Request');
        });

        it('without error message', async () => {
          const query = Object.assign({}, knownGoodQuery, { message: '' });
          const { text } = await makeRequest(referrer, query);
          expect(text).to.equal('Bad Request');
        });

        it('with blacklisted error', async () => {
          const query = Object.assign({}, knownGoodQuery, {
            message: 'stop_youtube',
          });

          sandbox.stub(Math, 'random').returns(0);
          const { text } = await makeRequest(referrer, query);
          expect(text).to.equal('Bad Request');
        });
      });

      it('ignores development errors', async () => {
        const query = Object.assign({}, knownGoodQuery, {
          version: '$internalRuntimeVersion$',
        });

        const { status } = await makeRequest(referrer, query);
        expect(status).to.equal(StatusCodes.OK);
      });

      describe('throttling', () => {
        it('does not throttle canary dev errors', async () => {
          const query = Object.assign({}, knownGoodQuery, { canary: true });

          sandbox.stub(Math, 'random').returns(1);
          const { status } = await makeRequest(referrer, query);
          expect(status).to.equal(StatusCodes.ACCEPTED);
        });

        it('does not throttle "control" binary type errors', async () => {
          const query = Object.assign({}, knownGoodQuery, {
            binaryType: 'control',
          });

          sandbox.stub(Math, 'random').returns(1);
          const { status } = await makeRequest(referrer, query);
          expect(status).to.equal(StatusCodes.ACCEPTED);
        });

        it('throttles 90% of production errors', async () => {
          const query = Object.assign({}, knownGoodQuery);

          sandbox.stub(Math, 'random').returns(0.1);
          const response1 = await makeRequest(referrer, query);
          expect(response1.status).to.equal(StatusCodes.ACCEPTED);

          Math.random.returns(0.11);
          const response2 = await makeRequest(referrer, query);
          expect(response2.status).to.equal(StatusCodes.OK);
        });

        it('does not throttles pre-throttled production errors', async () => {
          const query = Object.assign({ prethrottled: true }, knownGoodQuery);

          sandbox.stub(Math, 'random').returns(0.99);
          const { status } = await makeRequest(referrer, query);
          expect(status).to.equal(StatusCodes.ACCEPTED);
        });

        it('throttles 90% of canary user errors', async () => {
          const query = Object.assign({}, knownGoodQuery, {
            canary: true,
            assert: true,
          });

          sandbox.stub(Math, 'random').returns(0.1);
          const response1 = await makeRequest(referrer, query);
          expect(response1.status).to.equal(StatusCodes.ACCEPTED);

          Math.random.returns(0.11);
          const response2 = await makeRequest(referrer, query);
          expect(response2.status).to.equal(StatusCodes.OK);
        });

        it('throttles 90% of dev errors', async () => {
          sandbox.stub(Math, 'random').returns(0.1);
          const response1 = await makeRequest(referrer, knownGoodQuery);
          expect(response1.status).to.equal(StatusCodes.ACCEPTED);

          Math.random.returns(0.11);
          const response2 = await makeRequest(referrer, knownGoodQuery);
          expect(response2.status).to.equal(StatusCodes.OK);
        });

        it('throttles 99% of user errors', async () => {
          const query = Object.assign({}, knownGoodQuery, { assert: true });

          sandbox.stub(Math, 'random').returns(0.01);
          const response1 = await makeRequest(referrer, query);
          expect(response1.status).to.equal(StatusCodes.ACCEPTED);

          Math.random.returns(0.02);
          const response2 = await makeRequest(referrer, query);
          expect(response2.status).to.equal(StatusCodes.OK);
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

          it('logs http request', async () => {
            const { body } = await makeRequest(referrer, query);
            const { httpRequest } = body.event.context;
            expect(httpRequest.url).to.be.equal(
              '/r?v=011830043289240&m=The%20object%20does%20' +
                'not%20support%20the%20operation%20or%20argument.&a=0&rt=1p' +
                '&bt=production&s=&debug=1'
            );
            expect(httpRequest.userAgent).to.be.equal(userAgent);
            expect(httpRequest.referrer).to.be.equal(referrer);
          });

          it('logs missing stack trace', async () => {
            const { body } = await makeRequest(referrer, query);
            expect(body.event.message).to.be.equal(
              `Error: ${query.message}\n    at ` +
                'the-object-does-not-support-the-operation-or-argument.js:1:1'
            );
          });
        });

        describe('safari stack traces', () => {
          const query = Object.assign({}, knownGoodQuery, {
            stack:
              't@https://cdn.ampproject.org/v0.js:1:18\n' +
              'https://cdn.ampproject.org/v0.js:2:18',
            debug: true,
          });

          it('logs http request', async () => {
            const { body } = await makeRequest(referrer, query);
            const { httpRequest } = body.event.context;
            expect(httpRequest.url).to.be.equal(
              '/r?v=011830043289240&m=The%20object%20does%20' +
                'not%20support%20the%20operation%20or%20argument.&a=0&rt=1p' +
                '&bt=production' +
                '&s=t%40https%3A%2F%2Fcdn.ampproject.org%2Fv0.js%3A1%3A18%0A' +
                'https%3A%2F%2Fcdn.ampproject.org%2Fv0.js%3A2%3A18&debug=1'
            );
            expect(httpRequest.userAgent).to.be.equal(userAgent);
            expect(httpRequest.referrer).to.be.equal(referrer);
          });

          describe('when unminification fails', () => {
            it('logs full error', async () => {
              const { body } = await makeRequest(referrer, query);
              expect(body.event.message).to.be.equal(
                'Error: The object does not support the operation or argument.\n' +
                  '    at t (https://cdn.ampproject.org/v0.js:1:18)\n' +
                  '    at https://cdn.ampproject.org/v0.js:2:18'
              );
            });
          });

          describe('when unminification succeeds', () => {
            beforeEach(() => {
              nock('https://cdn.ampproject.org')
                .get('/rtv/metadata')
                .reply(200, {
                  ampRuntimeVersion: '011830043289240',
                  diversions: ['001830043289240'],
                })
                .get('/rtv/011830043289240/v0.js.map')
                .reply(200, rawSourceMap);
            });

            it('logs full error', async () => {
              const { body } = await makeRequest(referrer, query);
              expect(body.event.message).to.be.equal(
                'Error: The object does not support the operation or argument.\n' +
                  '    at bar (https://cdn.ampproject.org/one.js:1:21)\n' +
                  '    at n (https://cdn.ampproject.org/two.js:1:21)'
              );
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

          it('logs http request', async () => {
            const { body } = await makeRequest(referrer, query);
            const { httpRequest } = body.event.context;
            expect(httpRequest.url).to.be.equal(
              '/r?v=011830043289240&m=The%20object%20does%20' +
                'not%20support%20the%20operation%20or%20argument.&a=0&rt=1p' +
                '&bt=production' +
                '&s=The%20object%20does%20not%20support%20the%20operation%20or' +
                '%20argument.%0A%20%20%20%20at%20t%20(https%3A%2F%2Fcdn.ampproject.org' +
                '%2Fv0.js%3A1%3A18)%0A%20%20%20%20at%20https%3A%2F%2Fcdn.ampproject.' +
                'org%2Fv0.js%3A2%3A18&debug=1'
            );
            expect(httpRequest.userAgent).to.be.equal(userAgent);
            expect(httpRequest.referrer).to.be.equal(referrer);
          });

          describe('when unminification fails', () => {
            it('logs full error', async () => {
              const { body } = await makeRequest(referrer, query);
              expect(body.event.message).to.be.equal(
                'Error: The object does not support the operation or argument.\n' +
                  '    at t (https://cdn.ampproject.org/v0.js:1:18)\n' +
                  '    at https://cdn.ampproject.org/v0.js:2:18'
              );
            });
          });

          describe('when unminification succeeds', () => {
            beforeEach(() => {
              nock('https://cdn.ampproject.org')
                .get('/rtv/metadata')
                .reply(200, {
                  ampRuntimeVersion: '011830043289240',
                  diversions: ['001830043289240'],
                })
                .get('/rtv/011830043289240/v0.js.map')
                .reply(200, rawSourceMap);
            });

            it('logs full error', async () => {
              const { body } = await makeRequest(referrer, query);
              expect(body.event.message).to.be.equal(
                'Error: The object does not support the operation or argument.\n' +
                  '    at bar (https://cdn.ampproject.org/one.js:1:21)\n' +
                  '    at n (https://cdn.ampproject.org/two.js:1:21)'
              );
            });
          });
        });
      });
    });
  }
});
