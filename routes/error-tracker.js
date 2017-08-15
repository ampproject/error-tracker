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
const unminify = require('../utils/unminify');
const log = require('../utils/log');
const SERVER_START_TIME = Date.now();
const errorsToIgnore = ['stop_youtube',
  'null%20is%20not%20an%20object%20(evaluating%20%27elt.parentNode%27)'];
const jsStackTrace = /\.js:\d+:\d+/;
const mozillaSafariStackTraceRegex = /^([^@\n]*)@(.+):(\d+):(\d+)$/gm;
const versionRegex = /\/(rtv\/\d+\/)?v\d+(\/[\w-]+)?\.js/gm;
const chromeStackTraceRegex = require('../utils/regex').chromeRegex;
const appEngineProjectId = 'amp-error-reporting-js';
/**
 * @enum {int}
 */
const SEVERITY = {
  WARNING: 400,
  ERROR: 500,
};

/**
 * @param {string} stackTrace
 * @param {string} version
 * @return {string} Stacktrace with all the v0.js urls versioned
 * - 'at     error https://cdn.ampproject.org/v0.js:5:314' becomes
 *  'at     error https://cdn.ampproject.org/rtv/031496877433269//v0.js:5:314'
 */
function versionStackTrace(stackTrace, version) {
  return stackTrace.replace(versionRegex, function(match, group1) {
    if (!group1) {
      return '/rtv/' + version + match;
    }
    return match;
  });
}

/**
 * @param {string} stackTrace
 * @return {boolean} True if its a non JS stack trace
 */
function isNonJSStackTrace(stackTrace) {
  return stackTrace.split('\n').some(function(line) {
    return !jsStackTrace.test(line);
  });
}

/**
 * @param {string} message
 * @param {string} stack
 * @return {boolean}
 */
function ignoreMessageOrException(message, stack) {
  return errorsToIgnore.some(function(msg) {
    return message.includes(msg) || stack.includes(msg);
  });
}

/**
 * Converts a stack trace to the standard Chrome stack trace format.
 * @param {string} stackTrace
 * @return {string} The converted stack trace.
 */
function standardizeStackTrace(stackTrace) {
  if (chromeStackTraceRegex.test(stackTrace)) {
    // Discard garbage stack trace lines
    return stackTrace.match(chromeStackTraceRegex).join('\n');
  }
  let validStackTraceLines = [];
  let match;
  while ((match = mozillaSafariStackTraceRegex.exec(stackTrace))) {
    if (match[1]) {
      validStackTraceLines.push(
          ` at ${match[1]} (${match[2]}:` +
          `${match[3]}:${match[4]})`);
    } else {
      validStackTraceLines.push(
          ` at ${match[1]} ${match[2]}:` +
          `${match[3]}:${match[4]}`);
    }
  }
  return validStackTraceLines.join('\n');
}

/**
 * Extracts relevant information from request, handles edge cases and prepares
 * entry object to be logged and sends it to unminification.
 * @param {Request} req
 * @param {Response} res
 * @return {?Promise} May return a promise that rejects on logging error
 */
function getHandler(req, res) {
  const params = req.query;
  let stack = params.s || '';

  if (!params.r || !params.v || !params.m) {
    res.sendStatus(statusCodes.BAD_REQUEST);
    return null;
  }
  if (params.v.includes('$internalRuntimeVersion$')) {
    res.sendStatus(statusCodes.NO_CONTENT);
    return null;
  }
  if (ignoreMessageOrException(params.m, stack)) {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.status(statusCodes.BAD_REQUEST);
    res.send('IGNORE');
    return null;
  }

  const referer = params.r;
  let errorType = 'default';
  let isUserError = false;
  if (params.a === '1') {
    errorType = 'assert';
    isUserError = true;
  }

  // if request comes from the cache and thus only from valid
  // AMP docs we log as "Error"
  let severity = SEVERITY.WARNING;
  let isCdn = false;
  if (referer.startsWith('https://cdn.ampproject.org/') ||
      referer.includes('.cdn.ampproject.org/') ||
      referer.includes('.ampproject.net/')) {
    severity = SEVERITY.ERROR;
    errorType += '-cdn';
    isCdn = true;
  } else {
    errorType += '-origin';
  }

  let is3p = false;
  let runtime = params.rt;
  if (runtime) {
    errorType += '-' + runtime;
    if (runtime === 'inabox') {
      severity = SEVERITY.ERROR;
    }
    if (runtime === '3p') {
      is3p = true;
    }
  } else {
    if (params['3p'] === '1') {
      is3p = true;
      errorType += '-3p';
    } else {
      errorType += '-1p';
    }
  }

  let isCanary = false;
  if (params.ca === '1') {
    errorType += '-canary';
    isCanary = true;
  }
  if (params.ex === '1') {
    errorType += '-expected';
  }

  const sample = Math.random();
  let throttleRate = 0.1;
  if (isCanary) {
    throttleRate = 1.0; // explicitly log all errors
  } else if (is3p) {
    throttleRate = 0.1;
  } else if (isCdn) {
    throttleRate = 0.1;
  }

  if (isUserError) {
    throttleRate = throttleRate / 10;
  }
  if (sample > throttleRate) {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.status(statusCodes.OK).send('THROTTLED\n');
    return null;
  }

  // Convert Firefox/Safari stack traces to Chrome format if necessary.
  stack = standardizeStackTrace(stack);
  stack = versionStackTrace(stack, params.v);
  if (isNonJSStackTrace(stack)) {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.status(statusCodes.BAD_REQUEST);
    res.send('IGNORE');
    return null;
  }
  if (params.debug !== '1') {
    res.sendStatus(statusCodes.NO_CONTENT);
  }

  const event = {
    serviceContext: {
      service: errorType,
      version: params.v,
    },
    message: stack,
    context: {
      httpRequest: {
        url: req.url.toString(),
        userAgent: req.get('User-Agent'),
        referrer: params.r,
      },
    },
  };
  const metaData = {
    resource: {
      type: 'gae_app',
      labels: {
        version_id: SERVER_START_TIME.toString(),
      },
    },
    severity: severity,
  };
  return unminify.unminify(stack).then(function(unminifiedException) {
    event.message = params.m + '\n' + unminifiedException;
    const entry = log.entry(metaData, event);
    return new Promise(function(resolve, reject) {
      log.write(entry, function(err) {
        if (err) {
          winston.error(appEngineProjectId,
              'Cannot write to Google Cloud Logging: ' +params.v, err);
          console.log(err);
          reject(err);
        } else if (params.debug === '1') {
          res.set('Content-Type', 'application/json; charset=utf-8');
          res.status(statusCodes.OK).send({
            message: 'OK\n',
            event: event,
            throttleRate: throttleRate,
          });
          resolve();
        }
      });
    });
  }, function(err) {
    winston.error(params.m + '\n' + stack, err);
  });
}

module.exports = {getHandler, standardizeStackTrace, versionStackTrace,
  isNonJSStackTrace};
