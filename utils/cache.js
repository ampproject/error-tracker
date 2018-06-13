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

const debounce = require('./debounce');
const EXPIRATION = 2 * 7 * 24 * 60 * 60 * 1000;

/**
 * A wrapper around JS Map object to ensure no entry stays in map
 * more than 2 weeks without retrieval
 */
class Cache {
  /** */
  constructor() {
    this.map = new Map();
    this.deleteTriggers_ = new Map();
  }

  /**
   * @param {key} key
   * @param {!SourceMapConsumer} value
   */
  set(key, value) {
    this.map.set(key, value);

    let deleter = this.deleteTriggers_.get(key);
    if (!deleter) {
      deleter = debounce(() => this.delete(key), EXPIRATION);
      this.deleteTriggers_.set(key, deleter);
    }
    deleter();
  }

  /**
   * @param {key} key
   * @return {SourceMapConsumer} value
   */
  get(key) {
    const deleter = this.deleteTriggers_.get(key);
    if (deleter) {
      deleter();
    }
    return this.map.get(key);
  }

  /**
   * @param {key} key
   */
  delete(key) {
    const value = this.map.get(key);
    if (value) {
      this.map.delete(key);
      value.destroy();
    }
    this.deleteTriggers_.delete(key);
  }

  /**
   * @param {key} key
   * @return {boolean} Whether Map has entry.
   */
  has(key) {
    return this.map.has(key);
  }

  /**
   * @return {number} Size of Cache
   */
  get size() {
    return this.map.size;
  }
}

module.exports = Cache;
