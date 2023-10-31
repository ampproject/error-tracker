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

import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
// TODO(@danielrozenberg): replace this with native `fetch` when `nock` supports it.
import fetch from 'node-fetch';

import Cache from '../cache.js';
import Frame from './frame.js';
import { generic as genericLog } from '../log.js';

const twoWeeks = 2 * 7 * 24 * 60 * 60 * 1000;
const oneMinute = 60 * 1000;

/** @type {Cache<TraceMap>} */
const traceMapCache = new Cache(twoWeeks);
/** @type {Cache<Promise<TraceMap>>} */
const pendingRequests = new Cache(oneMinute);

const cdnJsRegex = new RegExp(
  // Require the CDN URL origin at the beginning.
  '^(https://cdn\\.ampproject\\.org)' +
    // Allow, but don't require, RTV.
    '(?:/rtv/(\\d{2}\\d{13,}))?' +
    // Require text "/v" followed by digits
    '(/(?:amp4ads-v|v)\\d+' +
    // Allow, but don't require, an extension under the v0 directory.
    '(?:/(.+?))?' +
    ')' +
    // Allow, but don't require, "-module" and "-nomodule".
    '(-(?:module|nomodule))?' +
    // Require ".js" or ".mjs" extension, optionally followed by ".br".
    '(\\.(m)?js)(\\.br)?$'
);

/**
 * For stack frames that are not CDN JS, we do not attempt to load a
 * real SourceMapConsumer.
 */
const nilConsumer = new TraceMap({
  version: 3,
  sources: [],
  mappings: [],
});

/**
 * Formats unversioned CDN JS files into the versioned url
 * @param {string} url
 * @param {string} version
 * @return {string}
 */
export function normalizeCdnJsUrl(url, version) {
  const match = cdnJsRegex.exec(url);
  if (!match) {
    return;
  }

  const [
    unused_fullMatch,
    origin,
    rtv = version,
    pathname,
    ampExtension,
    module = '',
    ext,
    /* brotli, */
  ] = match;

  // We explicitly forbid the experiments and validator "extensions" inside
  // the v0 directory.
  if (ampExtension === 'experiments' || ampExtension === 'validator') {
    return '';
  }

  const normModule = module === '-nomodule' ? '' : module;

  return `${origin}/rtv/${rtv}${pathname}${normModule}${ext}.map`;
}

/**
 * @param {!Frame} frame
 * @param {Object} consumer
 * @return {!Frame} Stack trace frame with column, line number and file name
 * references unminified.
 */
function unminifyFrame(frame, consumer) {
  const { column, line, name, source } = originalPositionFor(consumer, {
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
 * @return {Promise<TraceMap>} Promise that resolves to a source map.
 */
async function getSourceMapFromNetwork(url) {
  try {
    const res = await fetch(url);
    const consumer = new TraceMap(await res.json());
    traceMapCache.set(url, consumer);
    return consumer;
  } catch (err) {
    try {
      genericLog.write(
        genericLog.entry(
          {
            labels: {
              'appengine.googleapis.com/instance_name':
                process.env.GAE_INSTANCE,
            },
            resource: {
              type: 'gae_app',
              labels: {
                module_id: process.env.GAE_SERVICE,
                version_id: process.env.GAE_VERSION,
              },
            },
            severity: 500, // Error.
          },
          {
            message: 'failed retrieving source map',
            context: {
              url,
              message: err.message,
              stack: err.stack,
            },
          }
        )
      );
    } catch (writeErr) {
      console.error(writeErr);
    }
    throw err;
  }
}

/**
 * @param {Frame[]} stack
 * @param {string} version
 * @return {Promise<TraceMap[]>} Array of promises that resolve to source maps.
 */
async function extractSourceMaps(stack, version) {
  const sourceMaps = stack.map(({ source }) => {
    const sourceMapUrl = normalizeCdnJsUrl(source, version);

    if (!sourceMapUrl) {
      return nilConsumer;
    }

    if (traceMapCache.has(sourceMapUrl)) {
      return traceMapCache.get(sourceMapUrl);
    }

    if (!pendingRequests.has(sourceMapUrl)) {
      pendingRequests.set(sourceMapUrl, getSourceMapFromNetwork(sourceMapUrl));
    }
    return pendingRequests.get(sourceMapUrl);
  });
  return Promise.all(sourceMaps);
}

/**
 * @param {Frame[]} stack
 * @param {string} version
 * @return {Promise} Promise that resolves to unminified stack trace.
 */
export async function unminify(stack, version) {
  try {
    const consumers = await extractSourceMaps(stack, version);
    return stack.map((frame, i) => unminifyFrame(frame, consumers[i]));
  } catch (unused) {
    return stack;
  }
}
