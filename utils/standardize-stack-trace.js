/**
 * Copyright 2017 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const Frame = require('./frame');
const lineColumnNumbersRegex = '([^ \\n]+):(\\d+):(\\d+)';
const chromeFrame = new RegExp(`^\\s*at (?:` +
    `${lineColumnNumbersRegex}|(.+)? \\(${lineColumnNumbersRegex}\\))$`, 'gm');
const safariFrame = /^([^@\n]*)@(.+):(\d+):(\d+)$/gm;

/**
 * Parses a Chrome formatted stack trace string.
 * @param {string} stack
 * @return {!Array<!Frame>}
 */
function chromeStack(stack) {
  const frames = [];
  let match;

  while ((match = chromeFrame.exec(stack))) {
    frames.push(new Frame(
      match[4] || '',
      match[1] || match[5],
      match[2] || match[6],
      match[3] || match[7]
    ));
  }

  return frames;
}

/**
 * Parses a Safari formatted stack trace string.
 * @param {string} stack
 * @return {!Array<!Frame>}
 */
function safariStack(stack) {
  const frames = [];
  let match;

  while ((match = safariFrame.exec(stack))) {
    frames.push(new Frame(
      match[1] || '',
      match[2],
      match[3],
      match[4]
    ));
  }

  return frames;
}

/**
 * Standardizes Chrome/IE and Safari/Firefox stack traces into an array of
 * frame objects.
 * @param {string} stack
 * @return {!Array<!Frame>} The converted stack trace.
 */
function standardizeStackTrace(stack) {
  if (chromeFrame.test(stack)) {
    chromeFrame.lastIndex = 0;
    return chromeStack(stack);
  }

  return safariStack(stack);
}

module.exports = standardizeStackTrace;
