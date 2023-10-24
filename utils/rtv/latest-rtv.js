/**
 * Copyright 2018 The AMP Authors. All Rights Reserved.
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
 * @fileoverview Fetches the latest production RTV. This is used as a filter
 * to prevent reports for old errors from getting through.
 */

const Request = require('../requests/request');
const Cache = require('../cache');
const logs = require('../log');

const url = 'https://cdn.ampproject.org/rtv/metadata';
const fiveMin = 5 * 60 * 1000;
const fiftyMin = 50 * 60 * 1000;
const cache = new Cache(fiveMin, fiftyMin);

module.exports = function () {
  if (cache.has(url)) {
    return cache.get(url);
  }
  const req = new Promise((resolve, reject) => {
    Request.request(url, (err, _, body) => {
      if (err) {
        reject(err);
      } else {
        try {
          const { ampRuntimeVersion, ltsRuntimeVersion, diversions } =
            JSON.parse(body);
          const versions = [ampRuntimeVersion, ltsRuntimeVersion]
            .concat(diversions)
            .filter(Boolean);
          resolve(versions);
        } catch (e) {
          reject(e);
        }
      }
    });
  }).catch(async (err) => {
    const genericLog = await logs.generic;
    const entry = genericLog.entry(
      {
        labels: {
          'appengine.googleapis.com/instance_name': process.env.GAE_INSTANCE,
        },
        resource: {
          type: 'gae_app',
          labels: {
            module_id: process.env.GAE_SERVICE,
            version_id: process.env.GAE_VERSION,
          },
        },
        severity: 500, // Error.
      },
      `failed to fetch RTV metadata: ${err.message}`
    );
    genericLog.write(entry, (writeErr) => {
      if (writeErr) {
        console.warn('Error logging RTV fetch error: ', writeErr);
      }
    });

    cache.delete(url);
    return [];
  });

  cache.set(url, req);
  return req;
};
