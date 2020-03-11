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
  '^https://cdn.ampproject.org/|.cdn.ampproject.org/|.ampproject.net/',
  'i'
);

module.exports = class LoggingTarget {
  constructor(referrer, reportingParams) {
    this.opts = { referrer, ...reportingParams };
  }

  /** Select which error logging project to report to. */
  get log() {
    if (
      this.opts.runtime === 'inabox' ||
      this.opts.message.includes('Signing service error for google')
    ) {
      return logs.ads;
    }

    if (this.opts.assert) {
      return logs.users;
    }

    return logs.errors;
  }

  /** Construct the service bucket name for Stackdriver logging. */
  get serviceName() {
    // TODO: Drastically reduce combinatoral explosion of buckets.
    const name = ['default'];

    if (this.opts.singlePassType) {
      name.push(this.opts.singlePassType);
    }
    name.push(CDN_REGEX.test(this.opts.referrer) ? 'cdn' : 'origin');

    if (this.opts.runtime) {
      name.push(this.opts.runtime);
    } else if (this.opts.thirdParty) {
      name.push('3p');
    } else {
      name.push('1p');
    }

    // Do not append binary type if 'production' since that is the default
    if (this.opts.binaryType) {
      if (this.opts.binaryType !== 'production') {
        name.push(this.opts.binaryType);
      }
    } else if (this.opts.canary) {
      name.push('canary');
    }

    if (this.opts.assert) {
      name.push('user');
    }

    if (this.opts.expected) {
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
};
