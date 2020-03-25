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

process.env.NODE_ENV = 'test';

const chai = require('chai');
const chaihttp = require('chai-http');
const sinon = require('sinon');

const credentials = require('../utils/credentials');
sinon.stub(credentials, 'getCredentials').resolves({
  client_email: 'email@project.aim.gserviceaccount.com',
  private_key:
    '-----BEGIN PRIVATE KEY-----\nblahblahblah\n-----END PRIVATE KEY-----',
});
chai.use(chaihttp);

global.chai = chai;
global.expect = chai.expect;
global.sinon = sinon;
