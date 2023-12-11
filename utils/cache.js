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

import debounce from 'lodash.debounce';

/**
 * A wrapper around JS Map object to ensure no entry stays in map
 * more than 2 weeks without retrieval
 * @template T
 */
export class Cache {
  /**
   * @param {number} wait
   * @param {number=} maxWait
   */
  constructor(wait, maxWait = Infinity) {
    this.map = new Map();
    this.deleteTriggers_ = new Map();
    this.wait_ = wait;
    this.maxWait_ = maxWait;
  }

  /**
   * @param {key} key
   * @param {T} value
   */
  set(key, value) {
    this.map.set(key, value);

    let deleter = this.deleteTriggers_.get(key);
    if (!deleter) {
      deleter = debounce(
        () => {
          this.delete(key);
        },
        this.wait_,
        { maxWait: this.maxWait_ }
      );

      this.deleteTriggers_.set(key, deleter);
    }
    deleter();
  }

  /**
   * @param {key} key
   * @return {T}
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
    if (!this.has(key)) {
      return;
    }

    const value = this.map.get(key);
    if (value && value.destroy) {
      value.destroy();
    }
    this.map.delete(key);

    const deleter = this.deleteTriggers_.get(key);
    deleter.cancel();
    this.deleteTriggers_.delete(key);
  }

  /**
   * @param {key} key
   * @return {boolean}
   */
  has(key) {
    return this.map.has(key);
  }

  /**
   * @return {number}
   */
  get size() {
    return this.map.size;
  }
}
