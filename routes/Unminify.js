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
 * @type logJobs = {
 *   job : stackTrace event log to
 * }
 *
 */

const sourceMap = require('source-map');
const http = require('http');
const urlRegex  = /(https:(.*).js)/g;
let sourceMapConsumerCache = new Map();
let requestCache = new Map();
let logJobs = [];
let rawSourceMap;



/***
 * @param {string} stackTraceLine
 * @param {Object} sourceMapConsumer
 * @return {string}
 */
function unminifyLine(stackTraceLine, sourceMapConsumer) {
  let location = stackTraceLine.match(/:(\d+):(\d+)/g)[0];
  let locations = location.split(':');
  let originalPosition = sourceMapConsumer.originalPositionFor({
    line: locations[1],
    column: locations[2]
  });
  stackTraceLine.replace(urlRegex, originalPosition.source);
  let originalLocation = ':' + originalPosition.line + ':' + originalPosition.column;
  stackTraceLine.replace(location, originalLocation);
  return stackTraceLine;
}

function unminify(entry) {
  let stackTraces = entry.data.message;
  let promises = extractSourceMaps(stackTraces);
  Promise.all(promises).then(function(values) {
    values.forEach(function(res) {

    })
  });
}

/**
 * @return {Promise}
 */
function getFromInMemory(url) {
  return Promise.resolve(sourceMapConsumerCache.get(url));
}

function getFromNetwork(url) {
  const req = http.get(url);
  req.then((res) => {
    return new sourceMap.SourceMapConsumer(JSON.parse(res.body));
  });
  requestCache.add(url, req);
  return req;
}

function extractSourceMaps(stackTraces) {
  let promises = [];
  stackTraces.forEach(function(stackTraceLine) {
    let sourceMapUrl = urlRegex.exec(stackTraceLine)[0];
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
module.exports = unminify;

