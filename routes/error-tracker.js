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

import { StatusCodes } from 'http-status-codes';
import { extractReportingParams } from '../utils/requests/extract-reporting-params.js';
import { LoggingTarget } from '../utils/log-target.js';
import { standardizeStackTrace } from '../utils/stacktrace/standardize-stack-trace.js';
import { shouldIgnore } from '../utils/stacktrace/should-ignore.js';
import { unminify } from '../utils/stacktrace/unminify.js';
import { latestRtv } from '../utils/rtv/latest-rtv.js';

const CF_METADATA = {
  resource: {
    type: 'cloud_function',
    labels: {
      function_name: process.env.K_SERVICE,
    },
  },
  severity: 500, // Error.
};

/** Logs an event to Stackdriver. */
async function logEvent(log, event) {
  await log.write(log.entry(CF_METADATA, event));
}

/**
 * Construct an event object for logging.
 * @param {!Request} req
 * @param {!Object<string, string|function>} reportingParams
 * @param {!LoggingTarget} logTarget
 * @return {Promise<?Object<string, string>>} event object, or `null` if the
 *    error should be ignored.
 */
async function buildEvent(req, reportingParams, logTarget) {
  const { buildQueryString, message, stacktrace, version } = reportingParams;

  const userAgent = req.get('User-Agent');
  if (userAgent.includes('Googlebot')) {
    console.warn(`Ignored Googlebot errror report: ${message}`);
    return null;
  }

  const stack = standardizeStackTrace(stacktrace, message);
  if (shouldIgnore(message, stack)) {
    console.warn(`Ignored "${message}`);
    return null;
  }
  const unminifiedStack = await unminify(stack, version);

  const reqUrl =
    req.method === 'POST'
      ? `${req.originalUrl}?${buildQueryString()}`
      : req.originalUrl;
  const normalizedMessage = /^[A-Z][a-z]+: /.test(message)
    ? message
    : `Error: ${message}`;

  return {
    serviceContext: {
      service: logTarget.serviceName,
      version: logTarget.versionId,
    },
    message: [normalizedMessage, ...unminifiedStack].join('\n'),
    context: {
      httpRequest: {
        method: req.method,
        url: reqUrl,
        userAgent,
        referrer: req.get('Referrer'),
      },
    },
  };
}
/**
 * Extracts relevant information from request, handles edge cases and prepares
 * entry object to be logged and sends it to unminification.
 * @param {Request} req
 * @param {Response} res
 * @param {!Object<string, string>} params
 * @return {?Promise} May return a promise that rejects on logging error
 */
export async function errorTracker(req, res) {
  const referrer = req.get('Referrer');
  const params = req.body;
  const reportingParams = extractReportingParams(params);
  const { debug, message, version } = reportingParams;
  const logTarget = new LoggingTarget(referrer, reportingParams);
  const { log } = logTarget;

  // Reject requests missing essential info.
  if (!referrer || !version || !message) {
    return res.sendStatus(StatusCodes.BAD_REQUEST);
  }
  // Accept but ignore requests that get throttled.
  if (
    version.includes('internalRuntimeVersion') ||
    Math.random() > logTarget.throttleRate
  ) {
    return res.sendStatus(StatusCodes.OK);
  }

  const rtvs = await latestRtv();
  // Drop requests from RTVs that are no longer being served.
  if (rtvs.length > 0 && !rtvs.includes(version)) {
    return res.sendStatus(StatusCodes.GONE);
  }

  let event;
  try {
    event = await buildEvent(req, reportingParams, logTarget);
  } catch (unminifyError) {
    console.warn('Error unminifying:', unminifyError);
    return res.sendStatus(StatusCodes.UNPROCESSABLE_ENTITY);
  }

  // Drop reports of errors that should be ignored.
  if (!event) {
    return res.sendStatus(StatusCodes.BAD_REQUEST);
  }

  const debugInfo = {
    event,
    metaData: CF_METADATA,
    projectId: log.logging.projectId,
  };

  // Accept the error report and try to log it.
  res.status(StatusCodes.ACCEPTED);
  try {
    await logEvent(log, event);
  } catch (err) {
    console.warn('Error writing to log: ', err);
    debugInfo.error = err.stack;
  } finally {
    if (debug) {
      res.set('Content-Type', 'application/json; charset=utf-8');
      res.send(debugInfo);
    } else {
      res.end();
    }
  }
}
