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

import * as logs from '../../utils/log.js';
import { LoggingTarget } from '../../utils/log-target.js';

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
      version: '012004030010002',
    };
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('log', () => {
    it('returns error log', async () => {
      const logTarget = new LoggingTarget(referrer, reportingParams);

      expect(logTarget.log).to.equal(logs.errors);
    });

    it('returns ads log for inabox', async () => {
      reportingParams.runtime = 'inabox';
      const logTarget = new LoggingTarget(referrer, reportingParams);

      expect(logTarget.log).to.equal(logs.ads);
    });

    it('returns ads log for signing service error', async () => {
      reportingParams.message = 'Error: Signing service error for google';
      const logTarget = new LoggingTarget(referrer, reportingParams);

      expect(logTarget.log).to.equal(logs.ads);
    });

    it('returns user log for asserts', async () => {
      reportingParams.assert = true;
      const logTarget = new LoggingTarget(referrer, reportingParams);

      expect(logTarget.log).to.equal(logs.users);
    });

    it('returns expected log for expected errors', async () => {
      reportingParams.expected = true;
      const logTarget = new LoggingTarget(referrer, reportingParams);

      expect(logTarget.log).to.equal(logs.expected);
    });
  });

  describe('serviceName', () => {
    describe('referrer split', () => {
      [
        'https://cdn.ampproject.org/mywebsite.com/index.html',
        'https://mywebsite-com.cdn.ampproject.org/index.html',
        'https://mywebsite-com.ampproject.net/index.html',
      ].forEach((referrer) => {
        it(`correctly records "Google Cache" for referrer ${referrer}`, () => {
          const logTarget = new LoggingTarget(referrer, reportingParams);
          expect(logTarget.serviceName).to.contain('Google Cache');
          expect(logTarget.serviceName).to.not.contain('Publisher Origin');
        });
      });

      ['https://mywebsite.com/index.html', 'https://amp.dev/'].forEach(
        (referrer) => {
          it(`correctly records "Publisher Origin" for referrer ${referrer}`, () => {
            const logTarget = new LoggingTarget(referrer, reportingParams);
            expect(logTarget.serviceName).to.contain('Publisher Origin');
            expect(logTarget.serviceName).to.not.contain('Google Cache');
          });
        }
      );
    });

    describe('for origin referrers', () => {
      const serviceParams = [
        ['1%', '00XXXXXXXXXXXXX'],
        ['1%', '03XXXXXXXXXXXXX'],
        ['Production', '01XXXXXXXXXXXXX'],
        ['Production', '02XXXXXXXXXXXXX'],
        ['Nightly', '04XXXXXXXXXXXXX'],
        ['Nightly', '05XXXXXXXXXXXXX'],
        ['Experiments', '10XXXXXXXXXXXXX'],
        ['Experiments', '11XXXXXXXXXXXXX'],
        ['Experiments', '12XXXXXXXXXXXXX'],
        ['Inabox-Control-A', '20XXXXXXXXXXXXX'],
        ['Inabox-Experiment-A', '21XXXXXXXXXXXXX'],
        ['Inabox-Control-B', '22XXXXXXXXXXXXX'],
        ['Inabox-Experiment-B', '23XXXXXXXXXXXXX'],
        ['Inabox-Control-C', '24XXXXXXXXXXXXX'],
        ['Inabox-Experiment-C', '25XXXXXXXXXXXXX'],
      ];

      for (const [expectedName, version] of serviceParams) {
        it(`correctly constructs service name for "${expectedName} (${version})"`, () => {
          const logTarget = new LoggingTarget(
            referrer,
            Object.assign(reportingParams, {
              version,
              cdn: 'cdn.ampproject.org',
            })
          );

          expect(logTarget.serviceName).to.equal(
            `${expectedName} > Publisher Origin (cdn.ampproject.org)`
          );
        });
      }

      it('correctly constructs service name for expected errors', () => {
        const logTarget = new LoggingTarget(
          referrer,
          Object.assign(reportingParams, {
            assert: true,
            expected: true,
            cdn: 'cdn.ampproject.org',
          })
        );

        expect(logTarget.serviceName).to.equal(
          'Production > Publisher Origin (cdn.ampproject.org) > (Expected)'
        );
      });

      ['cdn.ampproject.org', 'ampjs.org'].forEach((cdn) => {
        it(`correctly constructs service name for JS served from ${cdn}`, () => {
          const logTarget = new LoggingTarget(
            referrer,
            Object.assign(reportingParams, { cdn })
          );

          expect(logTarget.serviceName).to.equal(
            `Production > Publisher Origin (${cdn})`
          );
        });
      });
    });

    it('correctly constructs service name for origin pages with unreported JS CDN', () => {
      const logTarget = new LoggingTarget(referrer, reportingParams);

      expect(logTarget.serviceName).to.equal(
        'Production > Publisher Origin (CDN not reported)'
      );
    });
  });

  describe('versionId', () => {
    it('returns the release version string', () => {
      const logTarget = new LoggingTarget(referrer, reportingParams);
      expect(logTarget.versionId).to.equal('04-03 Stable (0010+2)');
    });
  });

  describe('throttleRate', () => {
    beforeEach(() => {
      referrer = 'https://cdn.ampproject.org/mywebsite.com/index.html';
    });

    it('throttles Stable by a factor of 10', () => {
      const logTarget = new LoggingTarget(referrer, reportingParams);
      expect(logTarget.throttleRate).to.be.closeTo(1 / 10, 1e-6);
    });

    it('does not throttle canary', () => {
      reportingParams.canary = true;
      const logTarget = new LoggingTarget(referrer, reportingParams);
      expect(logTarget.throttleRate).to.be.closeTo(1, 1e-6);
    });

    it('does not throttle Control', () => {
      reportingParams.binaryType = 'control';
      const logTarget = new LoggingTarget(referrer, reportingParams);
      expect(logTarget.throttleRate).to.be.closeTo(1, 1e-6);
    });

    it('does not throttle RC', () => {
      reportingParams.binaryType = 'rc';
      const logTarget = new LoggingTarget(referrer, reportingParams);
      expect(logTarget.throttleRate).to.be.closeTo(1, 1e-6);
    });

    it('does not throttle Nightly', () => {
      reportingParams.binaryType = 'nightly';
      const logTarget = new LoggingTarget(referrer, reportingParams);
      expect(logTarget.throttleRate).to.be.closeTo(1, 1e-6);
    });

    it('throttles user errors by a factor of 10', () => {
      reportingParams.assert = true;
      const logTarget = new LoggingTarget(referrer, reportingParams);
      expect(logTarget.throttleRate).to.be.closeTo(1 / 100, 1e-6);
    });

    it('throttles errors from origin pages by a factor of 10', () => {
      referrer = 'https://myrandomwebsite.com';
      const logTarget = new LoggingTarget(referrer, reportingParams);
      expect(logTarget.throttleRate).to.be.closeTo(1 / 10, 1e-6);
    });

    it('throttles expected errors by a factor of 10', () => {
      reportingParams.expected = true;
      const logTarget = new LoggingTarget(referrer, reportingParams);
      expect(logTarget.throttleRate).to.be.closeTo(1 / 100, 1e-6);
    });

    it('throttles expected user errors in RC on origin by 100', () => {
      referrer = 'https://myrandomwebsite.com';
      reportingParams.assert = true;
      reportingParams.binaryType = 'rc';
      reportingParams.expected = true;
      const logTarget = new LoggingTarget(referrer, reportingParams);
      expect(logTarget.throttleRate).to.be.closeTo(1 / 100, 1e-6);
    });
  });
});
