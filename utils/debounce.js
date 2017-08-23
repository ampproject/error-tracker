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
 * @fileoverview A standard debounce utility.
 */

/**
 * @param  {function} callback
 * @param {int} minInterval
 * @return {Function}
 */
function debounce(callback, minInterval) {
  let locker = 0;
  let timestamp = 0;
  let nextCallArgs = null;

  /**
   * @param {args} args
   */
  function fire(args) {
    nextCallArgs = null;
    callback(...args);
  }

  /**
   * @desc Fires when wait time is done
   */
  function waiter() {
    locker = 0;
    const remaining = minInterval - (Date.now() - timestamp);
    if (remaining > 0) {
      locker = setTimeout(waiter, remaining);
    } else {
      fire(nextCallArgs);
    }
  }

  return function(...args) {
    timestamp = Date.now();
    nextCallArgs = args;
    if (!locker) {
      locker = setTimeout(waiter, minInterval);
    }
  };
}

module.exports = debounce;
