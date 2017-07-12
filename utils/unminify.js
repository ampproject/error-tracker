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

const sourceMap = require('source-map');
const Request = require('./request');
let sourceMapConsumerCache = new Map();
let requestCache = new Map();

/**
 * @param {string} stackTraceLine
 * @param {Object} sourceMapConsumer
 * @return {string} Stack trace line with column, line number and file name
 * references unminified.
 */
function unminifyLine(stackTraceLine, sourceMapConsumer) {
  const urlRegex = /(https:(.*).js)/g;
  const lineColumnNumberRegex = /:(\d+):(\d+)/g;
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
    /**
     * @param {error} err
     * @param {response} _
     * @param {body} body
     */
    function callback(err, _, body) {
      if (err) {
        rej(err);
      } else {
        try {
          let sourceMapConsumer = new sourceMap.SourceMapConsumer(
              JSON.parse(body));
          requestCache.delete(url);
          sourceMapConsumerCache.set(url, sourceMapConsumer);
          res(sourceMapConsumer);
        } catch (e) {
          rej(e);
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
 * @param {string} stackTrace
 * @return {Promise} Promise that resolves to unminified stack trace.
 */
function unminify(stackTrace) {
  const urlRegex = /(https:(.*).js)/g;
  let match;
  let stackTracesUrl = [];
  while ((match = urlRegex.exec(stackTrace))) {
    stackTracesUrl.push(match[0] + '.map');
  }
  let stackTraceLines = stackTrace.split('\n');
  const promises = extractSourceMaps(stackTracesUrl);
  return Promise.all(promises).then(function(values) {
    let i = 0;
    values.forEach(function(sourceMapConsumer) {
      stackTraceLines[i] = unminifyLine(stackTraceLines[i],
          sourceMapConsumer);
      i++;
    });
    return stackTraceLines.join('\n');
  }).catch(function(error) {
    return stackTrace;
  });
}

module.exports.unminify = unminify;
module.exports.unminifyLine = unminifyLine;
module.exports.extractSourceMaps = extractSourceMaps;

