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

/**
 * @fileoverview
 * Constructs the service bucket name and version identifier reported to
 * Stackdriver Logging.
 */

const logs = require('./log');

const CDN_REGEX = new RegExp(
  '^https://cdn\\.ampproject.org/|' +
    '\\.cdn\\.ampproject\\.org/|' +
    '\\.ampproject\\.net/',
  'i'
);

module.exports = class LoggingTarget {
  constructor(referrer, reportingParams) {
    this.opts = { referrer, ...reportingParams };
    this.log = this.logPromise();
  }

  /** Select which error logging project to report to. */
  logPromise() {
    const { runtime, message, assert } = this.opts;

    if (
      runtime === 'inabox' ||
      message.includes('Signing service error for google')
    ) {
      return logs.ads;
    }

    if (assert) {
      return logs.users;
    }

    return logs.errors;
  }

  /** Construct the service bucket name for Stackdriver logging. */
  get serviceName() {
    // TODO: Drastically reduce combinatoral explosion of buckets.
    const {
      singlePassType,
      referrer,
      runtime,
      thirdParty,
      binaryType,
      canary,
      assert,
      expected,
    } = this.opts;
    const name = ['default'];

    if (singlePassType) {
      name.push(singlePassType);
    }
    name.push(CDN_REGEX.test(referrer) ? 'cdn' : 'origin');

    if (runtime) {
      name.push(runtime);
    } else if (thirdParty) {
      name.push('3p');
    } else {
      name.push('1p');
    }

    // Do not append binary type if 'production' since that is the default
    if (binaryType) {
      if (binaryType !== 'production') {
        name.push(binaryType);
      }
    } else if (canary) {
      name.push('canary');
    }

    if (assert) {
      name.push('user');
    }
    if (expected) {
      name.push('expected');
    }

    return name.join('-');
  }

  /** Determine the version identifier to report to Stackdriver logging. */
  get versionId() {
    // Report the RTV.
    // TODO: Make this a more readable string.
    return this.opts.version;
  }

  /** Determine throttle level for error type. */
  get throttleRate() {
    const { canary, binaryType, assert, referrer, expected } = this.opts;
    console.log('Opts: ', {canary, binaryType, assert, referrer, expected});
    let throttleRate = 1;

    // Throttle errors from Stable.
    if (!canary && !['control', 'rc'].includes(binaryType)) {
      throttleRate /= 10;
    }

    // Throttle user errors.
    if (assert) {
      throttleRate /= 10;
    }

    // Throttle errors on origin pages; they may not be valid AMP docs.
    if (!CDN_REGEX.test(referrer)) {
      throttleRate /= 20;
    }

    if (expected) {
      throttleRate /= 10;
    }

    return throttleRate;
  }
};
