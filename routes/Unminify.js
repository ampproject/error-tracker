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
 * @type sourceMapCache = {
 *  key : url to JS file
 *  sourceMap : corresponding sourceMap
 * }
 * @type requestCache = {
 *  key : http request promise
 *  queue : queue of stack traces waiting for promise to use sourceMap
 * }
 *
 */

const sourceMap = require('source-map');
const http = require('http');
const urlRegex  = /(https:(.*).js)/g;
let sourceMapCache = new Map();
let requestCache = new Map();

let rawSourceMap;

/**
 * @param {string} stackTraceLine
 * @return {sourceMap}
 */
function selectSourceMapVersion(stackTraceLine) {
  let promisedSourceMap;
  let sourceMapUrl = urlRegex.exec(stackTraceLine)[0];
  if(sourceMapCache.has(sourceMapUrl)) {
    return sourceMapCache.get(sourceMapUrl);
  }
  if(requestCache.has(sourceMapUrl)) {
    requestCache.get(sourceMapUrl).push(stackTraceLine);
  } else {
    requestCache.set(sourceMapUrl, [stackTraceLine]);
    promisedSourceMap = http.get(sourceMapUrl + '.map');
    promisedSourceMap.then(function(err, res) {
      let loadedSourceMap = JSON.parse(res.body);
      sourceMapCache.set(sourceMapUrl, loadedSourceMap);
      let jobQueue = requestCache.get(sourceMapUrl);
      while(jobQueue.length !== 0) {

      }
    });
  }
  


}

function getRawSourceMap() {
  // to select appropriate source map based on version
  rawSourceMap ={};
  return rawSourceMap;
}

/***
 * @param {string} stackTraceLine
 */
function cache(stackTraceLine) {
  // Add stacktrace to the cache
}

/**
 * @param {string} stackTraceLine
 * @return {string}
 */
function retrieveCache(stackTraceLine) {
  // retrieve and return unminified stacktrace from the cache.
  return '';
}

/**
 * @param {string} stackTraceLine
 * @return {boolean}
 */
function cached(stackTraceLine) {
  // Check if stackTraceLine has previously been cached.
  return false;
}

/***
 * @param {string} stackTraceLine
 * @param {Object} sourceMap
 * @return {string}
 */
function unminifyLine(stackTraceLine, sourceMap) {
  const sourceMapConsumer  = new sourceMap.SourceMapConsumer(selectSourceMapVersion(stackTraceLine));
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

function unminify(entry, url) {


}
module.exports = unminify;

