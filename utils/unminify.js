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
 * to unminified. Caches requests for and source maps once obtained.
 */

const sourceMap = require('source-map');
const Request = require('./request');
const regex = require('./regex');
const Cache = require('./cache').Cache;
/** @type {!sourceMap<url, sourceMap>}*/
const sourceMapConsumerCache = new Cache();
/** @type {!request<url, Promise>}*/
const requestCache = new Map();

/**
 * @param {location} stackLocation
 * @param {Object} sourceMapConsumer
 * @return {string} Stack trace line with column, line number and file name
 * references unminified.
 */
function unminifyLine(stackLocation, sourceMapConsumer) {
  const currentPosition = ':' + stackLocation.lineNumber + ':' +
      stackLocation.columnNumber;
  const originalPosition = sourceMapConsumer.originalPositionFor({
    line: stackLocation.lineNumber,
    column: stackLocation.columnNumber,
  });
  let stackTraceLine = stackLocation.stackTraceLine.replace(
      stackLocation.sourceUrl, originalPosition.source);
  const originalLocation = ':' + originalPosition.line + ':'
      + originalPosition.column;
  return stackTraceLine.replace(currentPosition,
      originalLocation);
}

/**
 * @param {string} url
 * @return {Promise} Promise that resolves to a source map.
 */
function getSourceMapFromNetwork(url) {
  const reqPromise = new Promise((resolve, reject) => {
    Request.request(url, function callback(err, _, body) {
      if (err) {
        reject(err);
      } else {
        try {
          const sourceMapConsumer = new sourceMap.SourceMapConsumer(
              JSON.parse(body));
          requestCache.delete(url);
          sourceMapConsumerCache.set(url, sourceMapConsumer);
          resolve(sourceMapConsumer);
        } catch (e) {
          requestCache.delete(url);
          reject(e);
        }
      }
    });
  });
  requestCache.set(url, reqPromise);
  return reqPromise;
}

/**
 * @param {!Array<!location>} stackLocations
 * @return {!Array<!Promise>} Array of promises that resolve to source maps
 */
function extractSourceMaps(stackLocations) {
  return stackLocations.map(function(stackLocation) {
    if (sourceMapConsumerCache.has(stackLocation.sourceMapUrl)) {
      return Promise.resolve(sourceMapConsumerCache.get(
          stackLocation.sourceMapUrl));
    } else if (requestCache.has(stackLocation.sourceMapUrl)) {
      return requestCache.get(stackLocation.sourceMapUrl);
    } else {
     return getSourceMapFromNetwork(stackLocation.sourceMapUrl);
    }
  });
}

/**
 * @param {string} stackTrace
 * @return {Promise} Promise that resolves to unminified stack trace.
 */
function unminify(stackTrace) {
  const chromeStackTraceRegex = regex.chromeRegex();
  let match;
  const stackLocations = [];
  while ((match = chromeStackTraceRegex.exec(stackTrace))) {
    /**
     * @type location{
     * string: lineNumber
     * string: columnNumber
     * string: sourceMapUrl
     * string: sourceUrl
     * }
     */
    stackLocations.push({
      sourceMapUrl: match[4] + '.map',
      sourceUrl: match[4],
      lineNumber: parseInt(match[5], 10),
      columnNumber: parseInt(match[6], 10),
      stackTraceLine: match[0],
    });
  }
  const promises = extractSourceMaps(stackLocations);
  return Promise.all(promises).then(function(values) {
    const stackTraceLines = values.map(function(sourceMapConsumer, i) {
      return unminifyLine(stackLocations[i], sourceMapConsumer);
    });
    return stackTraceLines.join('\n');
  }, function() {
    return stackTrace;
  });
}

module.exports = {unminify, unminifyLine, extractSourceMaps};
