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
const url = require('url');
const unminify = require('./unminify');
const appEngineProjectId = 'amp-error-reporting';
const logName = 'javascript.errors';
const SERVER_START_TIME = Date.now();
const errorsToIgnore = ['stop_youtube',
  'null%20is%20not%20an%20object%20(evaluating%20%27elt.parentNode%27)'];
const lineColumnNumbers = '([^ \\n]+):(\\d+):(\\d+)';
const mozillaSafariStackTraceRegex = /^([^@\n]*)@(.+):(\d+):(\d+)$/gm;
const chromeStackTraceRegex = new RegExp(
    `^\\s*at (.+ )?(?:(${lineColumnNumbers})|\\(${lineColumnNumbers}\\))$`,
    'gm');
const loggingClient = logging({
  projectId: appEngineProjectId,
});
const log = loggingClient.log(logName);

/**
 * @enum {int}
 */
const SEVERITY = {
  INFO: 200,
  ERROR: 500,
};

/**
 * @param {string} message
 * @param {string} exception
 * @return {boolean}
 */
function ignoreMessageOrException(message, exception) {
  return errorsToIgnore.some(function(msg) {
    return message.includes(msg) || exception.includes(msg);
  });
}

/**
 * Converts a stack trace to the standard Chrome stack trace format.
 * @param {string} stackTrace
 * @return {string} The converted stack trace.
 */
function standardizeStackTrace(stackTrace) {
  if (chromeStackTraceRegex.test(stackTrace)) {
    // Convert Firefox/Safari stack traces to Chrome format if necessary.
    return stackTrace.match(chromeStackTraceRegex).join('\n');
  }
  let validStackTraceLines = [];
  let match;
  while ((match = mozillaSafariStackTraceRegex.exec(stackTrace))) {
    validStackTraceLines.push(
        ` at ${match[1]} ${match[2]}:` +
        `${match[3]}:${match[4]}`);
  }
  return validStackTraceLines.join('\n');
}

/**
 * Extracts relevant information from request, handles edge cases and prepares
 * entry object to be logged and sends it to unminification.
 * @param {Http.Request} req
 * @param {Http.Response} res
 */
function firstHandler(req, res) {
  const params = req.query;
  if (!params.r) {
    res.sendStatus(statusCodes.BAD_REQUEST).end();
    return;
  }
  if (!params.v) {
    res.sendStatus(statusCodes.BAD_REQUEST).end();
    return;
  }
  // Don't log testing traffic in production
  if (params.v.includes('$internalRuntimeVersion$')) {
    res.sendStatus(statusCodes.NO_CONTENT);
    res.end();
    return;
  }
  if (params.m === '' && params.s === '') {
    res.status(statusCodes.BAD_REQUEST);
    res.send({error: 'One of \'message\' or \'exception\' must be present.'});
    res.end();
    winston.log('Error', 'Malformed request: ' + params.v.toString(), req);
    return;
  }
  if (ignoreMessageOrException(params.m, params.s)) {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.status(statusCodes.BAD_REQUEST);
    res.send('IGNORE\n').end();
    return;
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
  let severity = SEVERITY.INFO;
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
    res.status(statusCodes.OK)
        .send('THROTTLED\n')
        .end();
    return;
  }

  let exception = params.s;
  if (ignoreMessageOrException(params.m, exception)) {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.status(statusCodes.BAD_REQUEST);
    res.send('IGNORE\n').end();
    return;
  }
  // If format does not end with :\d+ truncate up to the last newline.
  if (!exception.match(/:\d+$/)) {
    exception = exception.replace(/\n.*$/, '');
  }
  exception = standardizeStackTrace(exception);
  if (!exception) {
    res.status(statusCodes.BAD_REQUEST);
    res.send('IGNORE');
    res.end();
    winston.log('Error', 'Malformed request: ' + params.v.toString(), req);
    return;
  }
  let event = {
    serviceContext: {
      service: appEngineProjectId,
      version: errorType + '-' + params.v,
    },
    message: exception,
    context: {
      httpRequest: {
        url: req.url.toString(),
        userAgent: req.get('User-Agent'),
        referrer: params.r,
      },
    },
  };
  if (params.debug === '1' ) {
    res.set('Content-Type', 'application/json; charset=ISO-8859-1');
    res.status(statusCodes.OK).send(
        JSON.stringify({
          message: 'OK\n',
          event: event,
          throttleRate: throttleRate,
        })).end();
  } else {
    res.sendStatus(statusCodes.NO_CONTENT).end();
  }
  const metaData = {
    resource: {
      type: 'gae_app',
      labels: {
        project_id: 'amp-error-reporting',
        version_id: SERVER_START_TIME,
        module_id: 'default',
      },
    },
    severity: severity,
  };
  let entry = log.entry(metaData, event);
  unminify.unminify(entry, params.m);
}

/**
 * @param {httpRequest} req
 * @param {response} res
 * @param {middleware} next
 */
function getHandler(req, res, next) {
  firstHandler(req, res);
  // event.message = unminify(event.message)
  // loggingHandler(req, res);
  next();
}

module.exports.getHandler = getHandler;
module.exports.convertStackTrace = standardizeStackTrace;
