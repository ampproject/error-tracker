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

const strip = require('strip-invalid-trailing-encoding');

/**
 * Decodes the string's percent encoded chars, handling invalid
 * truncation during an escape sequence.
 *
 * @param {string} string
 * @return {string}
 */
function decode(string) {
  try {
    return decodeURIComponent(strip(string));
  } catch (e) {
    return '';
  }
}

module.exports = decode;
