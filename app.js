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

// Enable debugging in GCE
require('@google-cloud/debug-agent').start();

const bodyParser = require('body-parser');
const express = require('express');
const statusCodes = require('http-status-codes');
const errorTracker = require('./routes/error-tracker');
const querystring = require('./utils/query-string');

const app = express();
const port = parseInt(process.env.PORT, 10) || 8080;
const json = bodyParser.json({
  limit: '10kb',
  type: [
    'application/json',
    'text/plain', // Preflight-less JSON posts
  ],
});

app.set('etag', false);
app.set('trust proxy', true);
app.set('query parser', querystring.parse);

app.get('/_ah/health', function(req, res) {
  res.sendStatus(statusCodes.OK);
});

app.get('/r', (req, res) => {
  return errorTracker(req, res, req.query);
});
app.post('/r', json, (req, res) => {
  // Allow non-credentialed posts from anywhere.
  // Not strictly necessary, but it avoids an error being reported by the
  // browser.
  res.set('Access-Control-Allow-Origin', '*');
  return errorTracker(req, res, req.body);
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, function() {
    console.log('App Started on port ' + port);
  });
}

module.exports = app;
