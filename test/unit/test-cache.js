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

import { Cache } from '../../utils/cache.js';

describe('Cache cleans up unused entries periodically', () => {
  let sandbox;
  let clock;

  beforeEach(() => {
    sandbox = sinon.createSandbox({
      useFakeTimers: true,
    });
    clock = sandbox.clock;
  });
  afterEach(() => {
    sandbox.restore();
  });

  class Consumer {}
  class DestroyConsumer {
    destroy() {}
  }

  it('Should delete entry that has not been accessed in wait ms', () => {
    const cacheMap = new Cache(10);
    cacheMap.set(4, new Consumer());

    clock.tick(9);
    expect(cacheMap.size).to.equal(1);

    clock.tick(1);
    expect(cacheMap.size).to.equal(0);
  });

  it('Should reset lifetime of entry if accessed before wait ms', () => {
    const cacheMap = new Cache(10);
    cacheMap.set(4, new Consumer());

    clock.tick(9);
    expect(cacheMap.size).to.equal(1);

    cacheMap.get(4);
    clock.tick(1);
    expect(cacheMap.size).to.equal(1);
  });

  it('Should delete an entry that has been accessed after expiry', () => {
    const cacheMap = new Cache(10);
    cacheMap.set(4, new Consumer());

    clock.tick(10);
    expect(cacheMap.get(4)).to.equal(undefined);
  });

  it('Should call destroy on the entry after expiry if has destroy', () => {
    const cacheMap = new Cache(10);
    const consumer = new Consumer();
    const dconsumer = new DestroyConsumer();
    const spy = sandbox.spy(dconsumer, 'destroy');

    cacheMap.set(4, consumer);
    cacheMap.set(5, dconsumer);
    clock.tick(10);

    expect(spy.called).to.be.true;
  });

  it('Should delete after maxWait ms', () => {
    const cacheMap = new Cache(10, 30);
    cacheMap.set(4, new Consumer());

    clock.tick(9);
    cacheMap.get(4);
    clock.tick(9);
    cacheMap.get(4);
    clock.tick(9);
    cacheMap.get(4);
    expect(cacheMap.size).to.equal(1);

    clock.tick(2);
    expect(cacheMap.size).to.equal(1);

    clock.tick(1);
    expect(cacheMap.size).to.equal(0);
  });
});
