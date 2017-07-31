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

const mocha = require('mocha');
const sinon = require('sinon');
const chai = require('chai');
const it = mocha.it;
const describe = mocha.describe;
const expect = chai.expect;
const afterEach = mocha.afterEach;
const beforeEach = mocha.beforeEach;
const debounce = require('../utils/debounce').debounce;

describe('debounce', function() {
  let sandbox;
  let clock;
  beforeEach(function() {
    sandbox = sinon.sandbox.create();
    clock = sandbox.useFakeTimers();
  });
  afterEach(function() {
    sandbox.restore();
  });

  it('should wait before calling', () => {
    const callback = sandbox.spy();
    const debounced = debounce(callback, 100);
    debounced(1);
    expect(callback.callCount).to.equal(0);
    clock.tick(100);
    expect(callback.calledWith(1));
    callback.reset();
    debounced(1);
    expect(callback.callCount).to.equal(0);
    debounced(2);
    expect(callback.callCount).to.equal(0);
    clock.tick(10);
    debounced(3);
    expect(callback.callCount).to.equal(0);
    clock.tick(99);
    expect(callback.callCount).to.equal(0);
    clock.tick(1);
    expect(callback.calledWith(3));
  });

  it('should debounce recursive callback', () => {
    let totalCalls = 0;
    const debounced = debounce(function recursive(countdown) {
      totalCalls++;
      if (countdown > 0) {
        debounced(countdown - 1);
      }
    }, 100);
    // recursive 3 times
    debounced(2);
    expect(totalCalls).to.equal(0);
    // 1st invocation happen after the min interval
    clock.tick(100);
    expect(totalCalls).to.equal(1);
    // 2nd invocation
    clock.tick(100);
    expect(totalCalls).to.equal(2);
  });
});
