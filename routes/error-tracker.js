/**
 * Copyright 2017 The AMP Authors. All Rights Reserved.
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
 * Receive requests, handle edge cases, extract information and send it
 * to unmininification.
 */

const winston = require('winston');
const statusCodes = require('http-status-codes');
const log = require('../utils/log');
const standardizeStackTrace = require('../utils/standardize-stack-trace');
const ignoreMessageOrException = require('../utils/should-ignore');
const unminify = require('../utils/unminify');

/**
 * @enum {int}
 */
const SEVERITY = {
  WARNING: 400,
  ERROR: 500,
};

/**
 * Extracts relevant information from request, handles edge cases and prepares
 * entry object to be logged and sends it to unminification.
 * @param {Request} req
 * @param {Response} res
 * @return {?Promise} May return a promise that rejects on logging error
 */
function handler(req, res) {
  const params = req.query;
  const referrer = req.get('Referrer');
  const version = params.v;
  const message = decodeURIComponent(params.m || '');

  if (!referrer || !version || !message) {
    res.sendStatus(statusCodes.BAD_REQUEST);
    return null;
  }
  if (version.includes('$internalRuntimeVersion$')) {
    res.sendStatus(statusCodes.OK);
    return null;
  }

  const runtime = params.rt;
  const assert = params.a === '1';
  const canary = params.ca === '1';
  const expected = params.ex === '1';
  const debug = params.debug === '1';
  const thirdParty = params['3p'] === '1';

  let errorType = assert ? 'assert' : 'default';
  let severity = SEVERITY.WARNING;

  let throttleRate = canary ? 1 : 0.1;
  if (assert) {
    throttleRate = throttleRate / 10;
  }
  if (Math.random() > throttleRate) {
    res.sendStatus(statusCodes.OK);
    return null;
  }

  const stack = standardizeStackTrace(decodeURIComponent(params.s || ''));
  if (ignoreMessageOrException(message, stack)) {
    res.sendStatus(statusCodes.BAD_REQUEST);
    return null;
  }

  // if request comes from the cache and thus only from valid
  // AMP docs we log as "Error"
  if (referrer.startsWith('https://cdn.ampproject.org/') ||
      referrer.includes('.cdn.ampproject.org/') ||
      referrer.includes('.ampproject.net/')) {
    severity = SEVERITY.ERROR;
    errorType = errorType + '-cdn';
  } else {
    errorType = errorType + '-origin';
  }

  if (runtime) {
    errorType = errorType + '-' + runtime;
    if (runtime === 'inabox') {
      severity = SEVERITY.ERROR;
    }
  } else if (thirdParty) {
    errorType = errorType + '-3p';
  } else {
    errorType = errorType + '-1p';
  }
  if (canary) {
    errorType = errorType + '-canary';
  }
  if (expected) {
    errorType = errorType + '-expected';
  }

  const normalizedMessage = /^[A-Z][a-z]+: /.test(message) ?
      message :
      `Error: ${message}`;
  const event = {
    serviceContext: {
      service: errorType,
      version: version,
    },
    message: normalizedMessage,
    context: {
      httpRequest: {
        url: req.url.toString(),
        userAgent: req.get('User-Agent'),
        referrer: referrer,
      },
    },
  };
  const metaData = {
    resource: {
      type: 'gae_app',
      labels: {
        version_id: process.env.GAE_VERSION,
      },
    },
    severity: severity,
  };

  if (!debug) {
    res.sendStatus(statusCodes.ACCEPTED);
  }

  return unminify(stack, version).then((stack) => {
    if (stack.length) {
      event.message = event.message + `\n${stack.join('\n')}`;
    }

    return new Promise((resolve, reject) => {
      const entry = log.entry(metaData, event);

      log.write(entry, (err) => {
        if (debug) {
          if (err) {
            res.set('Content-Type', 'text/plain; charset=utf-8');
            res.status(statusCodes.INTERNAL_SERVER_ERROR);
            res.send(err.stack);
          } else {
            res.set('Content-Type', 'application/json; charset=utf-8');
            res.status(statusCodes.ACCEPTED);
            res.send({
              event: event,
              metaData: metaData,
            });
          }
        }

        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }).catch((err) => {
    winston.error(err);
  });
}

module.exports = handler;
