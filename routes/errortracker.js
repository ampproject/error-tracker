/**
 * Created by rigwanzojunior on 6/5/17.
 *objects used
 *Objects are identical to the objects used in previous errortracker.go
 * type errorRequestMeta {
	HTTPReferrer  string `json:"http_referrer,omitempty"`
	HTTPUserAgent string `json:"http_user_agent,omitempty"`
    }
 type errorRequest {
	URL    string            `json:"url,omitempty"`
	Method string            `json:"method,omitempty"`
	Meta   *errorRequestMeta `json:"meta,omitempty"`
 }
 type errorEvent {
	Application string `json:"application,omitempty"`
	AppID       string `json:"app_id,omitempty"`
	Environment string `json:"environment,omitempty"`
	Version     string `json:"version,omitempty"`

	Message   string `json:"message,omitempty"`
	Exception string `json:"exception,omitempty"`

	Request *errorRequest `json:"request,omitempty"`

	Filename  string `json:"filename,omitempty"`
	Line      int32  `json:"line,omitempty"`
	Classname string `json:"classname,omitempty"`
	Function  string `json:"function,omitempty"`
	Severity  string `json:"severity,omitempty"`
 }
 * Handle error requests from clients and log them.
 */
//AppEngine project ID
const projectId ='';
const logName = 'javascript.errors';
const express = require('express');
const router = express.Router();
const logging = require('@google-cloud/logging');
const winston = require('winston');
const statusCodes = require('http-status-codes');
const url = require('url');
//String constants for identifying error level.
const errorLevels = {
    Default:   "Default",
    Debug:     "Debug",
    Info:      "Info",
    Notice:    "Notice",
    Warning:   "Warning",
    Error:     "Error",
    Critical:  "Critical",
    Alert:     "Alert",
    Emergency: "Emergency"
};
//params in http request
var params = {};

/**
 * Filter exceptions in an array to prevent them from being logged
 * @param errorEvent
 * @returns {boolean}
 */
function isFilteredMessageOrException(errorEvent) {
    var filteredMessageOrException = ["stop_youtube",
        "null%20is%20not%20an%20object%20(evaluating%20%27elt.parentNode%27)"];
    filteredMessageOrException.forEach(function filter(msg){
        if(errorEvent.Message.toString().includes(msg) || errorEvent.Exception.toString().includes(msg)){
            return true;
        }
    });
    return false;

}

/**
 * Function that handles errors that come from an attempt to write to the logs
 * @param err error
 * @param res http response object
 */
function logWritingError(err,res) {
    if(err) {
        res.status(statusCodes.INTERNAL_SERVER_ERROR).send({error:'Cannot write to Google Cloud Logging'});
        winston.error(projectId, 'Cannot write to Google Cloud Logging: '+params['v'],err)
    }


}

/**
 *extract params in GET request from query and fill errorEvent object
 * @param req
 * @param res
 * @param next
 */
function getHandler(req,res,next){

    params = url.parse(req.url, true).query;
    var referer = req.get('Referer').toString();
    var resource = {
        type:'compute.googleapis.com',
        labels : {
            "compute.googleapis.com/resource_type": "logger",
            "compute.googleapis.com/resource_id":   "errors"
        }
    };
    var line = params['l'];
    var errorType = 'default';
    var isUserError = false;
    if(params['a'] === 1){
        errorType = 'assert';
        isUserError = true;
    }
    //log as INFO severity by default, because reports are spammy

    var severity = 'INFO';
    var level = errorLevels.Info;
    // if request comes from the cache and thus only from valid AMP docs we log as "Error"
    var isCdn =  false;
    if(referer.startsWith('https://cdn.ampproject.org/') ||
    referer.includes('cdn.ampproject.org/') ||
    referer.includes('.ampproject.net/')) {
        severity = 'ERROR';
        level = errorLevels.Error;
        errorType += '-cdn';
        isCdn = true;
    } else {
        errorType += '-origin'
    }
    var is3p = false;
    var runTime = params['rt'];
    if (runTime !== '') {
        errorType +=  '-' + runTime;
        if(runTime === 'inabox'){
            severity = 'ERROR';
            level = errorLevels.Error;
        }
        if(runTime === '3p'){
            is3p = true;

        }
    } else{
        if(params['3p'] === 1){
            is3p = true;
            errorType += '-3p';
        } else {
            errorType += '-1p';
        }
    }
    var isCanary = false;
    if(params['ca'] === 1){
        errorType += '-canary';
        isCanary = true;
    }
    if(params['ex'] === 1){
        errorType += '-expected';
    }
    var sample = Math.random(); 
    var throttleRate = 0.01;
    
    if(isCanary){
        throttleRate = 1.0 //explicitly log all errors

    } else if(is3p) {
        throttleRate = 0.1;

    } else if(isCdn){
        throttleRate = 0.1;
    }

    if(isUserError) {
        throttleRate = throttleRate/10;
    }

    if (!sample <= throttleRate) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.writeHead(statusCodes.OK);
        res.write("THROTTLED\n",res );
        return;
    }
    var exception  = params['s'].toString();
    var reg = new RegExp(':\d+$');
    if(exception.match(reg)){
        exception = exception.replace(new RegExp(':\d+$'),'');
    }

    //errorEvent object defined at the beginning.
    var event = {
        Message: params['m'],
        Exception: exception,
        Version: errorType + '-' + params['v'],
        Environment:'prod',
        Application : errorType,
        AppID: projectId,
        Filename : req.url.toString(),
        Line : parseInt(line),
        Classname: params['el'],
        Severity : severity

    };

    // If format does not end with :\d+ truncate up to the last newline.
    if(event.Message === '' && event.Exception === ''){
        res.status(statusCodes.BAD_REQUEST).send({error:"One of 'message' or 'exception' must be present."});
        winston.error(projectId, "Malformed request: " + params['v'].toString(), event);
        return;

    }
    if(isFilteredMessageOrException(event)){
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.writeHead(statusCodes.NO_CONTENT);
        res.write("IGNORE\n");
    }

    //Don't log testing traffic in production
    if(event.Version === '$internalRuntimeVersion$'){
        res.writeHead(statusCodes.NO_CONTENT);
        return;
    }

    event['Request'] = {
        URL:referer,
        Meta:{
            HTTPReferrer:params['r'],
            HTTPUserAgent:req.headers['user-agent']
        }
    };


    //get authentication context for logging
    var loggingClient = logging({
        projectId:projectId
    });
    var log = loggingClient.log(logName);
    var metaData = {
        resource:resource,
        level: level,
        time: new Date().getTime()
    };
    var entry = log.entry(metaData,event);
    log.write(entry,logWritingError);
    if(params['debug'] === '1'){
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.writeHead(statusCodes.OK);
        res.write('OK\n');
        res.write(event);
    }
    else{
        res.writeHead(statusCodes.NO_CONTENT);
    }


}

/**
 * Receive GET requests
 **/
router.get('/r',getHandler);
module.exports = router;
