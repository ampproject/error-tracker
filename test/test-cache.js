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
const Cache = require('../utils/cache').Cache;
const it = mocha.it;
const describe = mocha.describe;
const expect = chai.expect;
const afterEach = mocha.afterEach;
const beforeEach = mocha.beforeEach;

describe('Cache cleans up unused entries periodically', function() {
  let sandbox;
  let clock;

  beforeEach(function() {
    sandbox = sinon.sandbox.create();
    clock = sandbox.useFakeTimers();
  });
  afterEach(function() {
    sandbox.restore();
  });

  it('Should delete entry that has not been accessed in 2 weeks', function() {
     const cacheMap = new Cache();
     cacheMap.set(4, 'Four');
     clock.tick(2 * 7 * 24 * 60 * 60 * 1000 + 2 * 1000);
     expect(cacheMap.size()).to.equal(0);
  });
  it('Should reset lifetime of entry if accessed before 2 weeks', function() {
    const cacheMap = new Cache();
    cacheMap.set(4, 'four');
    clock.tick(1200000000);
    cacheMap.get(4);
    clock.tick(1200000000);
    expect(cacheMap.size()).to.equal(1);
  });
});
