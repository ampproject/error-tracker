
/**
 * Copyright 2017 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 * /

 /*
 * App.js file that handles routing and basic error handling
 */
const express = require('express');
const errorTracker = require('./routes/error-tracker');
const router = express.Router();

if (process.env.NODE_ENV === 'production') {
  require('@google-cloud/trace-agent').start();
  require('@google-cloud/debug-agent').start();
}


let app = express();
app.use(router);
app.get('/r', errorTracker);

module.exports = app;
