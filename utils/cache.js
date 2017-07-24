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

const debounce = require('./debounce').debounce;

/** Class wraps JS Map object to ensure no entry stays in map more than 2
 *  weeks without retrieval */
class Cache {
  /** Create a cache around Map */
  constructor() {
    this.expiryTime = 1209600000;
    this.map = new Map();
    this.deleteTriggers = new Map();
    this.debounce = debounce;
  }

  /**
   * @param {key} key
   * @param {Object} value
   */
  set(key, value) {
    this.map.set(key, value);
    const debounced = this.debounce(function(map) {
      map.delete(key);
    }, this.expiryTime);
    debounced(this.map);
    this.deleteTriggers.set(key, debounced);
  }

  /**
   * @param {key} key
   * @return {Object} value
   */
  get(key) {
    const debounced = this.deleteTriggers.get(key);
    debounced(this.map);
    this.deleteTriggers.set(key, debounced);
    return this.map.get(key);
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
  size() {
    return this.map.size;
  }
}

module.exports = {Cache};
