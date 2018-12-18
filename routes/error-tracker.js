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

const statusCodes = require('http-status-codes');
const safeDecodeURIComponent = require('safe-decode-uri-component');
const logs = require('../utils/log');
const standardizeStackTrace = require('../utils/standardize-stack-trace');
const ignoreMessageOrException = require('../utils/should-ignore');
const unminify = require('../utils/unminify');
const querystring = require('../utils/query-string');
const latestRtv = require('../utils/latest-rtv');

/**
 * Extracts relevant information from request, handles edge cases and prepares
 * entry object to be logged and sends it to unminification.
 * @param {Request} req
 * @param {Response} res
 * @param {!Object<string, string>} params
 * @return {?Promise} May return a promise that rejects on logging error
 */
function handler(req, res, params) {
  const referrer = req.get('Referrer');
  const version = params.v;
  const message = safeDecodeURIComponent(params.m || '');

  if (!referrer || !version || !message) {
    res.sendStatus(statusCodes.BAD_REQUEST);
    return null;
  }
  if (version.includes('internalRuntimeVersion')) {
    res.sendStatus(statusCodes.OK);
    return null;
  }

  const runtime = params.rt;
  const assert = params.a === '1';
  const canary = params.ca === '1';
  const binaryType = params.bt || '';
  const expected = params.ex === '1';
  const debug = params.debug === '1';
  const thirdParty = params['3p'] === '1';
  const singlePassType = params.spt;

  let errorType = 'default';

  if (singlePassType) {
    errorType += `-${singlePassType}`;
  }

  let throttleRate = canary || binaryType === 'control' ? 1 : 0.1;
  if (assert) {
    throttleRate /= 10;
  }

  let log = logs.errors;
  if (runtime === 'inabox' ||
      message.includes('Signing service error for google')) {
    log = logs.ads;
  } else if (assert) {
    log = logs.users;
  }

  // if request comes from the cache and thus only from valid
  // AMP docs we log as "Error"
  if (referrer.startsWith('https://cdn.ampproject.org/') ||
      referrer.includes('.cdn.ampproject.org/') ||
      referrer.includes('.ampproject.net/')) {
    errorType += '-cdn';
  } else {
    errorType += '-origin';
    throttleRate /= 20;
  }

  if (runtime) {
    errorType += '-' + runtime;
  } else if (thirdParty) {
    errorType += '-3p';
  } else {
    errorType += '-1p';
  }

  // Do not append binary type if 'production' since that is the default
  if (binaryType) {
    if (binaryType !== 'production') {
      errorType += `-${binaryType}`;
    }
  } else if (canary) {
    errorType += '-canary';
  }
  if (assert) {
    errorType += '-user';
  }
  if (expected) {
    errorType += '-expected';
    throttleRate /= 10;
  }

  if (Math.random() > throttleRate) {
    res.sendStatus(statusCodes.OK);
    return null;
  }

  return latestRtv().then((rtvs) => {
    if (rtvs.length > 0 && !rtvs.includes(version)) {
      res.sendStatus(statusCodes.OK);
      return null;
    }

    const stack = standardizeStackTrace(safeDecodeURIComponent(params.s || ''),
      message);
    if (ignoreMessageOrException(message, stack)) {
      res.sendStatus(statusCodes.BAD_REQUEST);
      return null;
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
          method: req.method,
          url: req.originalUrl,
          userAgent: req.get('User-Agent'),
          referrer: referrer,
        },
      },
    };

    if (req.method === 'POST') {
      event.context.httpRequest.url += '?' + querystring.stringify(params);
    }

    const metaData = {
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
      console.error(err);
    });
  });
}

module.exports = handler;
