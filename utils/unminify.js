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
 * @fileoverview Convert's stacktrace line, column number and file references
 * from minified to unminified. Caches requests for and source maps once
 * obtained.
 */

const sourceMap = require('source-map');
const Request = require('./request');
const Cache = require('./cache');
const Frame = require('./frame');

const sourceMapConsumerCache = new Cache();
const requestCache = new Map();

const cdnJsRegex = new RegExp(
    // Require the CDN URL origin at the beginning.
    '^(https://cdn\\.ampproject\\.org)' +
    // Allow, but don't require, RTV.
    '(?:/rtv/(\\d{2}\\d{13,}))?' +
    // Require text "/v" followed by digits
    '(/v\\d+' +
      // Allow, but don't require, an extension under the v0 directory.
      // We explicitly forbid the `experiments` and `validator` "extension".
      '(?:/(?!experiments|validator).+)?' +
    // Require text ".js" at the end.
    '\\.js)$');


/**
 * For stack frames that are not CDN JS, we do not attempt to load a
 * real SourceMapConsumer.
 */
const nilConsumer = {
  originalPositionFor({line, column}) {
    return {
      source: null,
      name: null,
      line: null,
      column: null,
    };
  },
};

/**
 * Formats unversioned CDN JS files into the versioned url
 * @param {string} url
 * @param {string} version
 * @return {string}
 */
function normalizeCdnJsUrl(url, version) {
  const [, origin, rtv, pathname] = cdnJsRegex.exec(url);
  if (rtv) {
    return url;
  }
  return `${origin}/rtv/${version}${pathname}`;
}

/**
 * @param {!Frame} frame
 * @param {Object} consumer
 * @return {!Frame} Stack trace frame with column, line number and file name
 * references unminified.
 */
function unminifyFrame(frame, consumer) {
  const {name, source, line, column} = consumer.originalPositionFor({
    line: frame.line,
    column: frame.column,
  });

  if (!source) {
    return frame;
  }

  return new Frame(name, source, line, column);
}

/**
 * @param {string} url
 * @return {Promise} Promise that resolves to a source map.
 */
function getSourceMapFromNetwork(url) {
  const reqPromise = new Promise((resolve, reject) => {
    Request.request(url, (err, _, body) => {
      requestCache.delete(url);

      if (err) {
        reject(err);
      } else {
        try {
          resolve(new sourceMap.SourceMapConsumer(
              JSON.parse(body)));
        } catch (e) {
          reject(e);
        }
      }
    });
  }).then((consumer) => {
    sourceMapConsumerCache.set(url, consumer);
    return consumer;
  });

  requestCache.set(url, reqPromise);
  return reqPromise;
}

/**
 * @param {!Array<!Frame>} stack
 * @param {string} version
 * @return {!Array<!Promise>} Array of promises that resolve to source maps
 */
function extractSourceMaps(stack, version) {
  return stack.map(({source}) => {
    if (!cdnJsRegex.test(source)) {
      return Promise.resolve(nilConsumer);
    }

    const sourceMapUrl = `${normalizeCdnJsUrl(source, version)}.map`;
    if (sourceMapConsumerCache.has(sourceMapUrl)) {
      return Promise.resolve(sourceMapConsumerCache.get(sourceMapUrl));
    }

    if (requestCache.has(sourceMapUrl)) {
      return requestCache.get(sourceMapUrl);
    }

    return getSourceMapFromNetwork(sourceMapUrl);
  });
}

/**
 * @param {!Array<!Frame>} stack
 * @param {string} version
 * @return {Promise} Promise that resolves to unminified stack trace.
 */
function unminify(stack, version) {
  const promises = extractSourceMaps(stack, version);

  return Promise.all(promises).then((consumers) => {
    return stack.map((frame, i) => unminifyFrame(frame, consumers[i]));
  }, () => stack);
}

module.exports = unminify;
