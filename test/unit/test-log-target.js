/**
 * Copyright 2020 The AMP Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const sinon = require('sinon');

const logs = require('../../utils/log');
const LogTarget = require('../../utils/log-target');

describe('log target', () => {
  let sandbox;
  let referrer;
  let reportingParams;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    referrer = 'https://my.awesomesite.com';
    reportingParams = {
      assert: false,
      binaryType: 'production',
      canary: false,
      debug: false,
      expected: false,
      message: 'Error: Something is borked!',
      queryString: '[query string]',
      runtime: '1p',
      singlePassType: undefined,
      stacktrace: 'Error: Something is borked!\n  at Error(<anonymous>)',
      thirdParty: false,
      version: '123456789',
    };
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('log', () => {
    it('returns error log', async () => {
      const logTarget = new LogTarget(referrer, reportingParams);

      expect(logTarget.log).to.equal(logs.errors);
    });

    it('returns ads log for inabox', async () => {
      reportingParams.runtime = 'inabox';
      const logTarget = new LogTarget(referrer, reportingParams);

      expect(logTarget.log).to.equal(logs.ads);
    });

    it('returns ads log for signing service error', async () => {
      reportingParams.message = 'Error: Signing service error for google';
      const logTarget = new LogTarget(referrer, reportingParams);

      expect(logTarget.log).to.equal(logs.ads);
    });

    it('returns user log for asserts', async () => {
      reportingParams.assert = true;
      const logTarget = new LogTarget(referrer, reportingParams);

      expect(logTarget.log).to.equal(logs.users);
    });

    it('returns expected log for expected errors', async () => {
      reportingParams.expected = true;
      const logTarget = new LogTarget(referrer, reportingParams);

      expect(logTarget.log).to.equal(logs.expected);
    });
  });

  describe('serviceName', () => {
    describe('for CDN referrers', () => {
      [
        'https://cdn.ampproject.org/mywebsite.com/index.html',
        'https://mywebsite-com.cdn.ampproject.org/index.html',
        'https://mywebsite-com.ampproject.net/index.html',
      ].forEach(referrer => {
        it(`records "cdn" for ${referrer}`, () => {
          const logTarget = new LogTarget(referrer, reportingParams);
          expect(logTarget.serviceName).to.contain('-cdn-');
        });
      });
    });

    describe('for origin referrers', () => {
      const serviceParams = {
        'default-origin-1p-canary': { binaryType: '', canary: true },
        'default-origin-1p-user': { assert: true },
        'default-origin-1p-expected': { expected: true },
        'default-origin-3p': { runtime: '', thirdParty: true },
        'default-origin-3p-experimental-expected': {
          runtime: '3p',
          binaryType: 'experimental',
          expected: true,
        },
      };

      for (const [expectedName, params] of Object.entries(serviceParams)) {
        it(`correctly constructs "${expectedName}"`, () => {
          const logTarget = new LogTarget(
            referrer,
            Object.assign(reportingParams, params)
          );

          expect(logTarget.serviceName).to.equal(expectedName);
        });
      }
    });
  });

  describe('versionId', () => {
    it('returns the release version number', () => {
      const logTarget = new LogTarget(referrer, reportingParams);
      expect(logTarget.versionId).to.equal('123456789');
    });
  });

  describe('throttleRate', () => {
    beforeEach(() => {
      referrer = 'https://cdn.ampproject.org/mywebsite.com/index.html';
    });

    it('throttles Stable by a factor of 10', () => {
      const logTarget = new LogTarget(referrer, reportingParams);
      expect(logTarget.throttleRate).to.be.closeTo(1 / 10, 1e-6);
    });

    it('does not throttle canary', () => {
      reportingParams.canary = true;
      const logTarget = new LogTarget(referrer, reportingParams);
      expect(logTarget.throttleRate).to.be.closeTo(1, 1e-6);
    });

    it('does not throttle Control', () => {
      reportingParams.binaryType = 'control';
      const logTarget = new LogTarget(referrer, reportingParams);
      expect(logTarget.throttleRate).to.be.closeTo(1, 1e-6);
    });

    it('does not throttle RC', () => {
      reportingParams.binaryType = 'rc';
      const logTarget = new LogTarget(referrer, reportingParams);
      expect(logTarget.throttleRate).to.be.closeTo(1, 1e-6);
    });

    it('does not throttle Nightly', () => {
      reportingParams.binaryType = 'nightly';
      const logTarget = new LogTarget(referrer, reportingParams);
      expect(logTarget.throttleRate).to.be.closeTo(1, 1e-6);
    });

    it('throttles user errors by a factor of 10', () => {
      reportingParams.assert = true;
      const logTarget = new LogTarget(referrer, reportingParams);
      expect(logTarget.throttleRate).to.be.closeTo(1 / 100, 1e-6);
    });

    it('throttles errors from origin pages by a factor of 20', () => {
      referrer = 'https://myrandomwebsite.com';
      const logTarget = new LogTarget(referrer, reportingParams);
      expect(logTarget.throttleRate).to.be.closeTo(1 / 200, 1e-6);
    });

    it('throttles expected errors by a factor of 10', () => {
      reportingParams.expected = true;
      const logTarget = new LogTarget(referrer, reportingParams);
      expect(logTarget.throttleRate).to.be.closeTo(1 / 100, 1e-6);
    });

    it('throttles expected user errors in RC on origin by 2000', () => {
      referrer = 'https://myrandomwebsite.com';
      reportingParams.assert = true;
      reportingParams.binaryType = 'rc';
      reportingParams.expected = true;
      const logTarget = new LogTarget(referrer, reportingParams);
      expect(logTarget.throttleRate).to.be.closeTo(1 / 2000, 1e-6);
    });
  });
});
