/**
 * Copyright 2016 The AMP HTML Authors. All Rights Reserved.
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
 * App.js file that handles routing and basic error handling
 */
let express = require('express');
let router = express.Router();
let errorTracker = require('./routes/errortracker');



if (process.env.NODE_ENV === 'production') {
  require('@google/cloud-trace-agent').start();
  require('@google/cloud-debug-agent').start();
}


let app = express();

app.use(router);
app.get('/r', errorTracker);


// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  // render the error page
  res.status(err.status || 500);
  res.write('error');
  next();
});

//app.listen(3000);

module.exports = app;


