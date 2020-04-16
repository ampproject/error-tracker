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

/**
 * @fileoverview exports log object to enable stubbing of write method
 */

const { getCredentials } = require('./credentials');
const { Logging } = require('@google-cloud/logging');

exports.generic = Promise.resolve(
  new Logging({
    projectId: 'amp-error-reporting',
  }).log('stderr')
);

exports.errors = Promise.resolve(
  new Logging({
    projectId: 'amp-error-reporting',
  }).log('javascript.errors')
);

exports.users = getCredentials('amp-error-reporting-users.json')
  .then(credentials =>
    new Logging({
      projectId: 'amp-error-reporting-user',
      credentials,
    }).log('javascript.errors')
  )
  .catch(error => {
    console.error(error);
    return exports.errors;
  });

exports.ads = getCredentials('amp-error-reporting-ads.json')
  .then(credentials =>
    new Logging({
      projectId: 'amp-error-reporting-ads',
      credentials,
    }).log('javascript.errors')
  )
  .catch(error => {
    console.error(error);
    return exports.errors;
  });

exports.expected = Promise.resolve(
  new Logging({
    projectId: 'amp-error-reporting-expected',
  }).log('javascript.errors')
);
