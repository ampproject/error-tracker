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
 * Handle error requests from clients and log them.
 */

const logging = require('@google-cloud/logging');
const winston = require('winston');
const statusCodes = require('http-status-codes');
const url = require('url');
const appEngineProjectId = 'amp-error-reporting';
const logName = 'javascript.errors';
const SERVER_START_TIME = Date.now();
const errorsToIgnore = ['stop_youtube',
  'null%20is%20not%20an%20object%20(evaluating%20%27elt.parentNode%27)'];
const mozillaSafariMidString = '@';
const chromeEtAlString = ' at ';

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
 * @desc converts stack traces and standardizes them to chrome like.
 * @param {string} exception
 * @return {string} standardized exception
 */
function stackTraceConversion(exception) {
  let chromeStackTraceRegex = /\s*at (?:([^\n]*) )?([^\n]+):(\d+):(\d+)[^]/gm;
  let mozillaSafariStackTraceRegex = /^([^@\n]*)@(.+):(\d+):(\d+)$/gm;
  let validException = '';
  let match;
  let validExceptions  = [];
  if (chromeStackTraceRegex.test(exception)) {
    // Reset the state of the regex to capture all matches.
    chromeStackTraceRegex.lastIndex = 0;
    while (match = chromeStackTraceRegex.exec(exception)) {
      validExceptions.push(match[0]);
    }
    validException = validExceptions.join('');
    // Remove first blank line
    validException = validException.trim();
  } else {
    let otherMatch;
    while (otherMatch = mozillaSafariStackTraceRegex.exec(exception)) {
      validExceptions.push(safariOrMozillaToChrome(otherMatch[0]));
    }
    validException = validExceptions.join('\n');
  }
  return validException;
}

/**
 * @param {string} exception
 * @return {string} chromeLikeException
 */
function safariOrMozillaToChrome(exception) {
  let context = exception.substring(0,
      exception.indexOf(mozillaSafariMidString));
  let notContext = exception.substring(exception.
      indexOf(mozillaSafariMidString) + 1);
  return chromeEtAlString + context + ' ' + notContext;
}

/**
 * @param {httpRequest} req
 * @param {response} res
 * @param {middleware} next
 */
function getHandler(req, res, next) {
  const params = req.query;
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

  // Don't log testing traffic in production
  if (params.v.includes('$internalRuntimeVersion$')) {
    res.sendStatus(statusCodes.NO_CONTENT);
    res.end();
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
  // If format does not end with :\d+ truncate up to the last newline.
  if (!exception.match(/:\d+$/)) {
    exception = exception.replace(/\n.*$/, '');
  }
  exception = stackTraceConversion(exception);
  if (!exception) {
    res.status(statusCodes.BAD_REQUEST);
    res.send({error: 'Exception must have a valid stack trace'});
    res.end();
    winston.log('Error', 'Malformed request: ' + params.v.toString(), req);
    return;
  }

  exception = params.m + '\n' + exception;
  const event = {
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


  // get authentication context for logging
  const loggingClient = logging({
    projectId: appEngineProjectId,
  });
  const log = loggingClient.log(logName);
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
  const entry = log.entry(metaData, event);
  log.write(entry, function(err) {
    if (err) {
      res.status(statusCodes.INTERNAL_SERVER_ERROR);
      res.send({error: 'Cannot write to Google Cloud Logging'});
      res.end();
      winston.error(appEngineProjectId, 'Cannot write to Google Cloud Logging: '
        + url.parse(req.url, true).query['v'], err);
    }
  });
  if (params.debug  === '1') {
    res.set('Content-Type', 'application/json; charset=ISO-8859-1');
    res.status(statusCodes.OK);
    res.send(
        JSON.stringify({
          message: 'OK\n',
          event: event,
          throttleRate: throttleRate,
        })
    ).end();
  } else {
    res.sendStatus(statusCodes.NO_CONTENT).end();
    return;
  }
  next();
}

module.exports = getHandler;
getHandler.stackTraceConversion = stackTraceConversion;
