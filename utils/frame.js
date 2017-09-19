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
 * Represents a single frame in a stack trace.
 */
class Frame {
  /**
   * @param {string} name The context name of the frame
   * @param {string} source The file source of the frame
   * @param {string} line The file line of the frame
   * @param {string} column The file column of the frame
   */
  constructor(name, source, line, column) {
    this.name = name;
    this.source = source;
    this.line = parseInt(line, 10);
    this.column = parseInt(column, 10);
  }

  /**
   * Returns a (Chrome formatted) string of the frame
   * @return {string}
   */
  toString() {
    const name = this.name;
    const location = `${this.source}:${this.line}:${this.column}`;

    if (name) {
      return `    at ${name} (${location})`;
    }
    return `    at ${location}`;
  }
}

module.exports = Frame;
