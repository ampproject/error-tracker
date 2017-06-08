/**
 * App.js file that handles routing and basic error handling
 * @type {*}
 */
let express = require('express');
let errorTracker = require('./routes/errortracker');


if (process.env.NODE_ENV === 'production') {
  require('@google/cloud-trace-agent').start();
  require('@google/cloud-debug-agent').start();
}


let app = express();


app.use('/r', errorTracker);


// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.write('error');
});

module.exports = app;

app.listen(3001, function() {
    console.log('Listening on port 3001');
});
