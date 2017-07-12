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
 * Convert's stacktrace line, column number and file references from minified
 * to unminified.
 * @type sourceMapConsumerCache = {
 *  key : url to JS file
 *  sourceMapConsumer : corresponding sourceMapConsumer.
 * }
 * @type requestCache = {
 *  key : url of sourceMap requested
 *  promise : promise that resolves to sourceMapConsumer
 * }
 */

const winston = require('winston');
const url = require('url');
const sourceMap = require('source-map');
const logging = require('@google-cloud/logging');
const Request = require('./request');
const urlRegex = /(https:(.*).js)/g;
const lineColumnNumberRegex = /:(\d+):(\d+)/g;
const appEngineProjectId = 'amp-error-reporting';
const logName = 'javascript.errors';
const loggingClient = logging({
  projectId: appEngineProjectId,
});
const log = loggingClient.log(logName);
let sourceMapConsumerCache = new Map();
let requestCache = new Map();

/**
 * @param {string} stackTraceLine
 * @param {Object} sourceMapConsumer
 * @return {string} Stack trace line with column, line number and file name
 * references unminified.
 */
function unminifyLine(stackTraceLine, sourceMapConsumer) {
  const lineColumnNumbers = lineColumnNumberRegex.exec(stackTraceLine);
  const originalPosition = sourceMapConsumer.originalPositionFor({
    line: parseInt(lineColumnNumbers[1]),
    column: parseInt(lineColumnNumbers[2]),
  });
  stackTraceLine = stackTraceLine.replace(urlRegex, originalPosition.source);
  const originalLocation = ':' + originalPosition.line + ':'
      + originalPosition.column;
  return stackTraceLine.replace(lineColumnNumbers[0], originalLocation);
}

/**
 * @param {string} url
 * @return {Promise} Promise that resolves to a source map.
 */
function getFromInMemory(url) {
  return Promise.resolve(sourceMapConsumerCache.get(url));
}

/**
 * @param {string} url
 * @return {Promise} Promise that resolves to a source map.
 */
function getFromNetwork(url) {
  const reqPromise = new Promise((res, rej) => {
    function callback(err, _, body) {
      if (err) {
        rej(err);
      } else {
        try {
          let sourceMapConsumer = new sourceMap.SourceMapConsumer(JSON.parse(body));
          requestCache.delete(url);
          sourceMapConsumerCache.set(url, sourceMapConsumer);
          res(sourceMapConsumer);
        } catch (e) {
          rej(e)
        }
      }
    }
    Request.request(url, callback);
  });
  requestCache.set(url, reqPromise);
  return reqPromise;
}

/**
 * @param {Array} sourceMapUrls
 * @return {Array} Array of promises that resolve to source maps
 */
function extractSourceMaps(sourceMapUrls) {
  let promises = [];
  sourceMapUrls.forEach(function(sourceMapUrl) {
    if (sourceMapConsumerCache.has(sourceMapUrl)) {
      promises.push(getFromInMemory(sourceMapUrl));
    } else if (requestCache.has(sourceMapUrl)) {
      promises.push(requestCache.get(sourceMapUrl));
    } else {
      promises.push(getFromNetwork(sourceMapUrl));
    }
  });
  return promises;
}

/**
 * @param {log.Entry} entry
 * @param {string} errorMessage
 */
function unminify(entry, errorMessage) {
  let match;
  let stackTracesUrl = [];
  while ((match = urlRegex.exec(entry.data.message))) {
    stackTracesUrl.push(match[0] + '.map');
  }
  const stackTraces = entry.data.message.split('\n');
  const promises = extractSourceMaps(stackTracesUrl);
  Promise.all(promises).then(function(values) {
    let i = 0;
    values.forEach(function(sourceMapConsumer) {
      if (!sourceMapConsumerCache.has(stackTracesUrl[i])) {
        sourceMapConsumerCache.set(stackTracesUrl[i], sourceMapConsumer);
        requestCache.delete(stackTracesUrl[i]);
      }
      stackTraces[i] = unminifyLine(stackTraces[i],
          sourceMapConsumerCache.get(stackTraces[i]));
      i++;
    });
  });
  entry.data.message = errorMessage + '\n' + stackTraces.join('\n');
  loggingHandler(entry);
}

/**
 * @param {log.Entry} entry
 */
function loggingHandler(entry) {
  log.write(entry, function(err) {
    if (err) {
      winston.error(appEngineProjectId,
          'Cannot write to Google Cloud Logging: ' + url.parse(
              entry.event.context.httpRequest.url, true).query['v'], err);
    }
  });
}
module.exports.unminify = unminify;
module.exports.unminifyLine = unminifyLine;
module.exports.extractSourceMaps = extractSourceMaps;

