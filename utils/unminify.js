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
 * to unminified. Caches requests for and source maps and once obtained.
 * }
 */

const sourceMap = require('source-map');
const Request = require('./request');
const lineColumnNumbersRegex = '([^ \\n]+):(\\d+):(\\d+)';
/** @type {!sourceMap<url, sourceMap>}*/
const sourceMapConsumerCache = new Map();
/** @type {!request<url, Promise>}*/
const requestCache = new Map();

/**
 * @param {string} stackTraceLine
 * @param {Object} sourceMapConsumer
 * @return {string} Stack trace line with column, line number and file name
 * references unminified.
 */
function unminifyLine(stackTraceLine, sourceMapConsumer) {
  const chromeStackTraceRegex = new RegExp(
      `^\\s*at (.+ )?(?:((${lineColumnNumbersRegex}))|` +
      `\\((${lineColumnNumbersRegex}\\)))$`, 'gm');
  [_, _, _, _, sourceUrl, lineNumber, columnNumber] =
      chromeStackTraceRegex.exec(stackTraceLine);
  const currentPosition = ':' + lineNumber + ':' + columnNumber;
  const originalPosition = sourceMapConsumer.originalPositionFor({
    line: parseInt(lineNumber, 10),
    column: parseInt(columnNumber, 10),
  });
  stackTraceLine = stackTraceLine.replace(sourceUrl, originalPosition.source);
  const originalLocation = ':' + originalPosition.line + ':'
      + originalPosition.column;
  return stackTraceLine.replace(currentPosition, originalLocation);
}

/**
 * @param {string} url
 * @return {Promise} Promise that resolves to a source map.
 */
function getSourceMapFromNetwork(url) {
  const reqPromise = new Promise((res, rej) => {
    Request.request(url, function callback(err, _, body) {
      if (err) {
        rej(err);
      } else {
        try {
          const sourceMapConsumer = new sourceMap.SourceMapConsumer(
              JSON.parse(body));
          requestCache.delete(url);
          sourceMapConsumerCache.set(url, sourceMapConsumer);
          res(sourceMapConsumer);
        } catch (e) {
          rej(e);
        }
      }
    });
  });
  requestCache.set(url, reqPromise);
  return reqPromise;
}

/**
 * @param {!Array<!string>} sourceMapUrls
 * @return {!Array<!Promise>} Array of promises that resolve to source maps
 */
function extractSourceMaps(sourceMapUrls) {
  return sourceMapUrls.map(function(sourceMapUrl) {
    if (sourceMapConsumerCache.has(sourceMapUrl)) {
      return Promise.resolve(sourceMapConsumerCache.get(sourceMapUrl));
    } else if (requestCache.has(sourceMapUrl)) {
      return requestCache.get(sourceMapUrl);
    } else {
     return getSourceMapFromNetwork(sourceMapUrl);
    }
  });
}

/**
 * @param {string} stackTrace
 * @return {Promise} Promise that resolves to unminified stack trace.
 */
function unminify(stackTrace) {
  const chromeStackTraceRegex = new RegExp(
      `^\\s*at (.+ )?(?:((${lineColumnNumbersRegex}))|\\` +
      `((${lineColumnNumbersRegex}\\)))$`, 'gm');
  let match;
  const stackTracesUrl = [];
  while ((match = chromeStackTraceRegex.exec(stackTrace))) {
    stackTracesUrl.push(match[4] + '.map');
  }
  const stackTraceLines = stackTrace.split('\n');
  const promises = extractSourceMaps(stackTracesUrl);
  return Promise.all(promises).then(function(values) {
    values.forEach(function(sourceMapConsumer, i) {
      stackTraceLines[i] = unminifyLine(stackTraceLines[i],
          sourceMapConsumer);
    });
    return stackTraceLines.join('\n');
  }, function() {
    return stackTrace;
  });
}

module.exports.unminify = unminify;
module.exports.unminifyLine = unminifyLine;
module.exports.extractSourceMaps = extractSourceMaps;

