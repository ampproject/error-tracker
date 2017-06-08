/**
 * App.js file that handles routing and basic error handling
 * @type {*}
 */
let express = require('express');
let router = express.Router();
let errorTracker = require('./routes/errortracker');



if (process.env.NODE_ENV === 'production') {
  require('@google/cloud-trace-agent').start();
  require('@google/cloud-debug-agent').start();
}


let app = express();

//app.use(router);
app.get('/r', errorTracker);
// app.get('/r',function (req,res) {
//     res.json({foo: 'bar'});
// });


// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.write('error');
});

//app.listen(3000);

module.exports = app;


