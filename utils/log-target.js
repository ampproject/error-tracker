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
const humanRtv = require('./rtv/human-rtv');
const releaseChannels = require('./rtv/release-channels');

const CDN_REGEX = new RegExp(
  '^https://cdn\\.ampproject.org/|' +
    '\\.cdn\\.ampproject\\.org/|' +
    '\\.ampproject\\.net/',
  'i'
);

module.exports = class LoggingTarget {
  constructor(referrer, reportingParams) {
    this.opts = { referrer, ...reportingParams };
    this.log = this.getLog();
  }

  /** Select which error logging project to report to. */
  getLog() {
    const { runtime, message, assert, expected } = this.opts;

    if (
      runtime === 'inabox' ||
      message.includes('Signing service error for google')
    ) {
      return logs.ads;
    }

    if (assert) {
      return logs.users;
    }

    if (expected) {
      return logs.expected;
    }

    return logs.errors;
  }

  /** Construct the service bucket name for Stackdriver logging. */
  get serviceName() {
    const { referrer, version, expected } = this.opts;
    const rtvPrefix = version.substr(0, 2);

    const name = [CDN_REGEX.test(referrer) ? 'CDN' : 'Origin'];
    name.push(
      rtvPrefix in releaseChannels
        ? releaseChannels[rtvPrefix].group
        : 'Unknown'
    );

    if (expected && this.getLog() !== logs.expected) {
      // Expected errors are split out of the main bucket, but are present for
      // user and inabox errors.
      name.push('(Expected)');
    }

    return name.join(' ');
  }

  /** Determine the version identifier to report to Stackdriver logging. */
  get versionId() {
    return humanRtv(this.opts.version);
  }

  /** Determine throttle level for error type. */
  get throttleRate() {
    const {
      canary,
      binaryType,
      assert,
      referrer,
      expected,
      prethrottled,
    } = this.opts;
    let throttleRate = 1;

    // Throttle errors from Stable, unless pre-throttled on the client.
    if (!canary && binaryType === 'production' && !prethrottled) {
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
