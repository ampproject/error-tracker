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
 *
 */

const sourceMap = require('source-map');
let rawSourceMap;


function selectSourceMapVersion() {

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
 * @return {string}
 */
function unminify(stackTraceLine) {
  if(cached(stackTraceLine)){
    return retrieveCache(stackTraceLine);
  }
  const sourceMapConsumer  = new sourceMap.SourceMapConsumer(rawSourceMap);
  let location = stackTraceLine.match(/:(\d+):(\d+)/g)[0];
  let locations = location.split(':');
  let originalPosition = sourceMapConsumer.originalPositionFor({
    line: locations[1],
    column: locations[2]
  });
  stackTraceLine.replace(/(https:(.*).js)/, originalPosition.source);
  let originalLocation = ':' + originalPosition.line + ':' + originalPosition.column;
  stackTraceLine.replace(location, originalLocation);
  cache(stackTraceLine);
  return stackTraceLine;
}



module.exports = unminify;

