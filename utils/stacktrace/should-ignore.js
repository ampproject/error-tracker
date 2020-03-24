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

/**
 * @fileoverview A helper that blacklists some stacks from being reported.
 */

const errorsToIgnore = [
  'stop_youtube',
  'null%20is%20not%20an%20object%20(evaluating%20%27elt.parentNode%27)',
];
const JS_REGEX = /\.(mjs|js(\.br)?)$/;

/**
 * @param {!Array<!Frame>} stack
 * @return {boolean} True if its a non JS stack trace
 */
function isNonJSStackTrace(stack) {
  return !stack.every(({ source }) => {
    return JS_REGEX.test(source);
  });
}

/**
 * @param {string} message
 * @return {boolean}
 */
function includesBlacklistedError(message) {
  return errorsToIgnore.some(msg => message.includes(msg));
}

/**
 * @param {string} message
 * @param {!Array<!Frame>} stack
 * @return {boolean}
 */
function shouldIgnore(message, stack) {
  return includesBlacklistedError(message) || isNonJSStackTrace(stack);
}

module.exports = shouldIgnore;
