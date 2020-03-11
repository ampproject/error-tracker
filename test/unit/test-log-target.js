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
      version: 123456789,
    };
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('log', () => {
    it('returns error log', () => {
      const logTarget = new LogTarget(referrer, reportingParams);
      expect(logTarget.log).to.equal(logs.errors);
    });

    it('returns ads log for inabox', () => {
      reportingParams.runtime = 'inabox';
      const logTarget = new LogTarget(referrer, reportingParams);
      expect(logTarget.log).to.equal(logs.ads);
    });

    it('returns ads log for signing service error', () => {
      reportingParams.message = 'Error: Signing service error for google';
      const logTarget = new LogTarget(referrer, reportingParams);
      expect(logTarget.log).to.equal(logs.ads);
    });

    it('returns user log for asserts', () => {
      reportingParams.assert = true;
      const logTarget = new LogTarget(referrer, reportingParams);
      expect(logTarget.log).to.equal(logs.users);
    });
  });
});
