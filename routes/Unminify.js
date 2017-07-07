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
 * version to unminified version.
 * @type sourceMapConsumerCache = {
 *  key : url to JS file
 *  sourceMapConsumer : corresponding sourceMap
 * }
 * @type requestCache = {
 *  key : url of sourceMap requested
 *  promise : promise waiting tobe resolved
 * }
 */

const sourceMap = require('source-map');
const http = require('http');
const log = require('error-tracker').loggingHandler;
const urlRegex = /(https:(.*).js)/g;
let sourceMapConsumerCache = new Map();
let requestCache = new Map();

/**
 * @param {string} stackTraceLine
 * @param {Object} sourceMapConsumer
 * @return {string} Stack trace line with column, line number and file name
 * references unminified.
 */
function unminifyLine(stackTraceLine, sourceMapConsumer) {
  let lineColumnNumbers = stackTraceLine.match(/:(\d+):(\d+)/g)[0];
  let locations = lineColumnNumbers.split(':');
  let originalPosition = sourceMapConsumer.originalPositionFor({
    line: locations[1],
    column: locations[2],
  });
  stackTraceLine.replace(urlRegex, originalPosition.source);
  let originalLocation = ':' + originalPosition.line + ':'
      + originalPosition.column;
  stackTraceLine.replace(lineColumnNumbers, originalLocation);
  return stackTraceLine;
}

/**
 *
 * @param {log.Entry} entry
 * @param {string} error
 */
function unminify(entry, error) {
  let stackTraces = entry.data.message.split('\n');
  let stackTracesUrl = stackTraces.map(function(stackTrace) {
    return urlRegex.exec(stackTrace)[0];
  });
  let promises = extractSourceMaps(stackTracesUrl);
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
  entry.data.message = error + '\n' + stackTraces.join('\n');
  log(entry);
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
 * @return {Promise} Promise that resolves to a source map
 */
function getFromNetwork(url) {
  const req = http.get(url);
  req.then((res) => {
    return new sourceMap.SourceMapConsumer(JSON.parse(res.body));
  });
  requestCache.add(url, req);
  return req;
}

/**
 *
 * @param {Array} stackTraces
 * @return {Array} Array of promises that resolve to source maps
 */
function extractSourceMaps(stackTraces) {
  let promises = [];
  stackTraces.forEach(function(sourceMapUrl) {
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

module.exports.unminify = unminify;

