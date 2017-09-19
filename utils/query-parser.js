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

const regex = /(?:^|&)([^=&]+)(?:=([^&]*))?/g;

/**
 * Parses a query string into an object.
 * Note, the string values will not be decoded.
 *
 * @param {string} query
 * @return {!Object<string, string>}
 */
function queryparser(query) {
  const params = Object.create(null);
  let max = 25;
  let match;

  while (max-- && (match = regex.exec(query))) {
    const name = match[1];
    const value = match[2];
    params[name] = value === void 0 ? '' : value;
  }

  regex.lastIndex = 0;
  return params;
}

module.exports = queryparser;
