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
const extractReportingParams = require('../utils/requests/extract-reporting-params');
const LogTarget = require('../utils/log-target');
const standardizeStackTrace = require('../utils/stacktrace/standardize-stack-trace');
const ignoreMessageOrException = require('../utils/stacktrace/should-ignore');
const unminify = require('../utils/stacktrace/unminify');
const latestRtv = require('../utils/latest-rtv');

const GAE_METADATA = {
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

/** Logs an event to Stackdriver. */
async function logEvent(log, event) {
  await log.write(log.entry(GAE_METADATA, event));
}

/**
 * Extracts relevant information from request, handles edge cases and prepares
 * entry object to be logged and sends it to unminification.
 * @param {Request} req
 * @param {Response} res
 * @param {!Object<string, string>} params
 * @return {?Promise} May return a promise that rejects on logging error
 */
async function handler(req, res, params) {
  const referrer = req.get('Referrer');
  const reportingParams = extractReportingParams(params);
  const {
    debug,
    message,
    buildQueryString,
    stacktrace,
    version,
  } = reportingParams;
  const logTarget = new LogTarget(referrer, reportingParams);

  if (!referrer || !version || !message) {
    res.sendStatus(statusCodes.BAD_REQUEST);
    return null;
  }
  if (
    version.includes('internalRuntimeVersion') ||
    Math.random() > logTarget.throttleRate
  ) {
    res.sendStatus(statusCodes.OK);
    return null;
  }

  const rtvs = await latestRtv();
  if (rtvs.length > 0 && !rtvs.includes(version)) {
    res.sendStatus(statusCodes.OK);
    return null;
  }

  const stack = standardizeStackTrace(stacktrace, message);
  if (ignoreMessageOrException(message, stack)) {
    res.sendStatus(statusCodes.BAD_REQUEST);
    return null;
  }
  if (!debug) {
    res.sendStatus(statusCodes.ACCEPTED);
  }

  const unminifiedStack = await unminify(stack, version);
  const reqUrl =
    req.method === 'POST'
      ? `${req.originalUrl}?${buildQueryString()}`
      : req.originalUrl;
  const normalizedMessage = /^[A-Z][a-z]+: /.test(message)
    ? message
    : `Error: ${message}`;
  const event = {
    serviceContext: {
      service: logTarget.serviceName,
      version: logTarget.versionId,
    },
    message: [normalizedMessage].concat(unminifiedStack).join('\n'),
    context: {
      httpRequest: {
        method: req.method,
        url: reqUrl,
        userAgent: req.get('User-Agent'),
        referrer: referrer,
      },
    },
  };

  try {
    await logEvent(logTarget.log, event);

    if (debug) {
      console.log('THEN');
      res.set('Content-Type', 'application/json; charset=utf-8');
      res.status(statusCodes.ACCEPTED);
      res.send({ event, metaData: GAE_METADATA });
    }
  } catch (err) {
    console.error(err);

    if (debug) {
      console.log('CATCH');
      res.set('Content-Type', 'text/plain; charset=utf-8');
      res.status(statusCodes.INTERNAL_SERVER_ERROR);
      res.send(writeErr.stack);
    }
  }
}

module.exports = handler;
