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
const parseErrorHandling = require('./utils/requests/parse-error-handling');

const app = express();
const BODY_LIMIT = 10 * 1024 /* 10kb */;
function rawJsonBodyParserMiddleware(req, res, next) {
  if (!req.rawBody) {
    // Defer to bodyParser when running as a server.
    jsonParser = express.json({
      limit: BODY_LIMIT,
      type: () => true,
    });
    jsonParser(req, res, next);
  } else if (req.rawBody.length > BODY_LIMIT) {
    // When Cloud Functions hijacks the request, validate and parse it manually.
    next(statusCodes.REQUEST_TOO_LONG);
  } else {
    req.body = JSON.parse(req.rawBody.toString());
    next();
  }
}

app.set('etag', false);
app.set('trust proxy', true);

// Parse the JSON request body
app.use(rawJsonBodyParserMiddleware);
// Handle BodyParser PayloadTooLargeError errors
app.use(parseErrorHandling);

app.post('*', (req, res) => {
  // Allow non-credentialed posts from anywhere.
  // Not strictly necessary, but it avoids an error being reported by the
  // browser.
  res.set('Access-Control-Allow-Origin', '*');
  return errorTracker(req, res);
});

module.exports = app;
