/**
 * App.js file that handles routing and basic error handling
 * @type {*}
 */
var express = require('express');
var bodyParser = require('body-parser');
var errorTracker = require('./routes/errortracker');


if(process.env.NODE_ENV === 'production'){
  require('@google/cloud-trace').start();
  require('@google/cloud-debug').start();
}


var app = express();


app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use('/r', errorTracker);


// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
