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
 * @fileoverview
 * App.js file that handles routing and basic error handling
 */

const express = require('express');
const errorTracker = require('./routes/error-tracker');
const statusCodes = require('http-status-codes');

if (process.env.NODE_ENV === 'production') {
  require('@google-cloud/trace-agent').start();
  require('@google-cloud/debug-agent').start();
}


const app = express();
const port = parseInt(process.env.port) || 3000;

app.get('/', function(req, res) {
  res.sendStatus(statusCodes.OK).end();
});

app.get('/r', errorTracker);

app.listen(port, function() {
  console.log('App Started on port ' + port);
});

module.exports = app;
