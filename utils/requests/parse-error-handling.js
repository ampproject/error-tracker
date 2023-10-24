/**
 * Copyright 2019 The AMP HTML Authors. All Rights Reserved.
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
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const statusCodes = require('http-status-codes');
const logs = require('../log');

let timestamp = 0;
const fiveMin = 5 * 60 * 1000;
const truncatedLength = 2 * 1024; // 2kb

module.exports = function (err, req, res, next) {
  if (err.statusCode !== statusCodes.REQUEST_TOO_LONG) {
    // Some other error. Let it propagate.
    return next(err);
  }

  // Log every 5 min
  const now = Date.now();
  if (now > timestamp + fiveMin) {
    read(req, res);
    timestamp = now;
  }
};

/**
 * @param {!Request} req
 * @param {!Response} res
 */
function read(req, res) {
  let message = '';
  req.resume();
  req.on('data', onData);
  req.on('end', onEnd);
  req.on('error', onEnd);

  /**
   * @param {Buffer} data
   */
  function onData(data) {
    message += data;
    if (message.length >= truncatedLength) {
      message = message.slice(0, truncatedLength);
      onEnd();
    }
  }
  /** */
  function onEnd() {
    log(message);
    cleanup();
    res.sendStatus(statusCodes.REQUEST_TOO_LONG);
  }

  /** */
  function cleanup() {
    req.removeListener('data', onData);
    req.removeListener('end', onEnd);
    req.removeListener('error', onEnd);
  }

  /**
   * @param {string} message
   */
  function log(message) {
    const entry = logs.generic.entry(
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
        severity: 400, // Warning.
      },
      {
        message: 'PayloadTooLargeError',
        context: {
          httpRequest: {
            method: req.method,
            url: req.originalUrl,
            userAgent: req.get('User-Agent'),
            referrer: req.get('Referrer'),
            body: message,
          },
        },
      }
    );
    logs.generic.write(entry, (writeErr) => {
      if (writeErr) {
        console.error(writeErr);
      }
    });
  }
}
