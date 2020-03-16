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

const express = require('express');
const statusCodes = require('http-status-codes');
const errorTracker = require('./routes/error-tracker');
const querystring = require('./utils/requests/query-string');
const parseErrorHandling = require('./utils/requests/parse-error-handling');
const json = require('./utils/requests/json');

const app = express();
const port = parseInt(process.env.PORT, 10) || 8080;

app.set('etag', false);
app.set('trust proxy', true);
app.set('query parser', querystring.parse);

app.get(['/readiness_check', '/liveness_check', '/_ah/health'], (req, res) => {
  res.sendStatus(statusCodes.OK);
});

app.get('/r', (req, res) => errorTracker(req, res, req.query));
app.post('/r', json, async (req, res) => {
  // Allow non-credentialed posts from anywhere.
  // Not strictly necessary, but it avoids an error being reported by the
  // browser.
  res.set('Access-Control-Allow-Origin', '*');
  return await errorTracker(req, res, req.body);
});

// Handle BodyParser PayloadTooLargeError errors
app.use(parseErrorHandling);

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, function() {
    console.log('App Started on port ' + port);
  });
}

module.exports = app;
