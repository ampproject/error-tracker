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

import * as logs from './log.js';
import humanRtv from './rtv/human-rtv.js';
import releaseChannels from './rtv/release-channels.js';

const GOOGLE_AMP_CACHE_REGEX = new RegExp(
  '^https://cdn\\.ampproject.org/|' +
    '\\.cdn\\.ampproject\\.org/|' +
    '\\.ampproject\\.net/',
  'i'
);

export class LoggingTarget {
  constructor(referrer, reportingParams) {
    this.opts = { referrer, ...reportingParams };
    this.log = this.getLog();
  }

  /** Select which error logging project to report to. */
  getLog() {
    const { assert, expected, message, runtime } = this.opts;

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
    const { cdn, expected, referrer, version } = this.opts;
    const rtvPrefix = version.substr(0, 2);

    const name = [releaseChannels[rtvPrefix]?.group ?? '[Unspecified Channel]'];
    if (GOOGLE_AMP_CACHE_REGEX.test(referrer)) {
      name.push('Google Cache');
    } else if (cdn) {
      name.push(`Publisher Origin (${cdn})`);
    } else {
      name.push(`Publisher Origin (CDN not reported)`);
    }

    if (expected && this.getLog() !== logs.expected) {
      // Expected errors are split out of the main bucket, but are present for
      // user and inabox errors.
      name.push('(Expected)');
    }

    return name.join(' > ');
  }

  /** Determine the version identifier to report to Stackdriver logging. */
  get versionId() {
    return humanRtv(this.opts.version);
  }

  /** Determine throttle level for error type. */
  get throttleRate() {
    const { assert, binaryType, canary, expected, prethrottled } = this.opts;
    let throttleRate = 1;

    // Throttle errors from Stable, unless pre-throttled on the client.
    if (!canary && binaryType === 'production' && !prethrottled) {
      throttleRate /= 10;
    }

    // Throttle user errors.
    if (assert) {
      throttleRate /= 10;
    }

    if (expected) {
      throttleRate /= 10;
    }

    return throttleRate;
  }
}
