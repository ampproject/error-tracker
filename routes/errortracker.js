/**
 * Created by rigwanzojunior on 6/5/17.
 *objects used
 *Objects are identical to the objects used in previous errortracker.go
 * @typedef errorRequestMeta {
	HTTPReferrer: string,
	HTTPUserAgent: string
    }
  @typedef errorRequest {
	URL:  string,
	Method: string,
	Meta: errorRequestMeta
  }
  @typedef errorEvent {
	Application: string,
	AppID; string,
	Environment: string,
	Version: string,
	Message: string,
	Exception: string,
	Request: *errorRequest,
	Filename: string,
	Line: int32,
	Classname: string,
	Function: string,
	Severity: string
   }
 * Handle error requests from clients and log them.
 */
// AppEngine project ID
const projectId ='';
const logName = 'javascript.errors';
const express = require('express');
const router = express.Router();
const logging = require('@google-cloud/logging');
const winston = require('winston');
const statusCodes = require('http-status-codes');
const Math = require('./Math');
const url = require('url');
/**
 * errorLevels
 * @enum {string}
 */
const errorLevels = {
    Default: 'Default',
    Debug: 'Debug',
    Info: 'Info',
    Notice: 'Notice',
    Warning: 'Warning',
    Error: 'Error',
    Critical: 'Critical',
    Alert: 'Alert',
    Emergency: 'Emergency',
};
// params in http request
let params = {};

/**
 * Filter exceptions in an array to prevent them from being logged
 * @param errorEvent
 * @returns {boolean}
 */
function isFilteredMessageOrException(errorEvent) {
    let filteredMessageOrException = ['stop_youtube',
        'null%20is%20not%20an%20object%20(evaluating%20%27elt.parentNode%27)'];
    filteredMessageOrException.some(function filter(msg) {
        if (errorEvent.Message.toString().includes(msg) || errorEvent.Exception.toString().includes(msg)) {
            return true;
        }
    });
    return false;
}

/**
 * Function that handles errors that come from an attempt to write to the logs
 * @param err error
 * @param res http response object
 * @param req http request object
 */
function logWritingError(err, res,req) {
    if (err) {
        res.status(statusCodes.INTERNAL_SERVER_ERROR).send({error: 'Cannot write to Google Cloud Logging'});
        winston.error(projectId, 'Cannot write to Google Cloud Logging: '+url.parse(req.url, true).query['v'], err);
    }
}

/**
 *extract params in GET request from query and fill errorEvent object
 * @param req
 * @param res
 * @param next
 */
function getHandler(req, res, next) {
    params = url.parse(req.url, true).query;
    res.status(statusCodes.OK).send({foo:"Barrrer", referer: req.get('content-type')});
    return;
    let referer = req.get('Referer');
    let resource = {
        type: 'compute.googleapis.com',
        labels: {
            'compute.googleapis.com/resource_type': 'logger',
            'compute.googleapis.com/resource_id': 'errors',
        },
    };
    let line = params.l;
    let errorType = 'default';
    let isUserError = false;
    if (params.a === 1) {
        errorType = 'assert';
        isUserError = true;
    }
    // log as INFO severity by default, because reports are spammy

    let severity = 'INFO';
    let level = errorLevels.Info;
    // if request comes from the cache and thus only from valid AMP docs we log as "Error"
    let isCdn = false;
    if (referer.startsWith('https://cdn.ampproject.org/') ||
    referer.includes('.cdn.ampproject.org/') ||
    referer.includes('.ampproject.net/')) {
        severity = 'ERROR';
        level = errorLevels.Error;
        errorType += '-cdn';
        isCdn = true;
    } else {
        errorType += '-origin';
    }
    let is3p = false;
    let runTime = params.rt;
    if (runTime !== '') {
        errorType += '-' + runTime;
        if (runTime === 'inabox') {
            severity = 'ERROR';
            level = errorLevels.Error;
        }
        if (runTime === '3p') {
            is3p = true;
        }
    } else {
        if (params['3p'] === 1) {
            is3p = true;
            errorType += '-3p';
        } else {
            errorType += '-1p';
        }
    }
    let isCanary = false;
    if (params.ca === 1) {
        errorType += '-canary';
        isCanary = true;
    }
    if (params.ex === 1) {
        errorType += '-expected';
    }
    let sample = Math.random();
    let throttleRate = 0.01;

    if (isCanary) {
        throttleRate = 1.0; // explicitly log all errors
    } else if (is3p) {
        throttleRate = 0.1;
    } else if (isCdn) {
        throttleRate = 0.1;
    }

    if (isUserError) {
        throttleRate = throttleRate/10;
    }

    if (sample <= throttleRate) {
        res.set('Content-Type', 'text/plain ; charset=utf-8');
        res.status(statusCodes.OK).send('THROTTLED\n');
        return;
    }
    let exception = params.s.toString();
    let reg = /:\d+$/;
    if (!exception.match(reg)) {
        exception = exception.replace(reg, '');
    }

    // errorEvent object defined at the beginning.
    let event = {
        message: params.m,
        exception: exception,
        version: errorType + '-' + params.v,
        environment: 'prod',
        application: errorType,
        appID: projectId,
        filename: req.url.toString(),
        line: parseInt(line),
        classname: params.el,
        severity: severity,

    };

    // If format does not end with :\d+ truncate up to the last newline.
    if (event.Message === '' && event.Exception === '') {
        res.status(statusCodes.BAD_REQUEST).send({error: 'One of \'message\' or \'exception\' must be present.'});
        winston.error(projectId, 'Malformed request: ' + params.v.toString(), event);
        return;
    }
    if (isFilteredMessageOrException(event)) {
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.status(statusCodes.NO_CONTENT).send('IGNORE\n');
        return;
    }

    // Don't log testing traffic in production
    if (event.version === '$internalRuntimeVersion$') {
        res.sendStatus(statusCodes.NO_CONTENT);
        return;
    }

    event['Request'] = {
        URL: referer,
        Meta: {
            HTTPReferrer: params.r,
            HTTPUserAgent: req.headers['user-agent'],
        },
    };


    // get authentication context for logging
    let loggingClient = logging({
        projectId: projectId,
    });
    let log = loggingClient.log(logName);
    let metaData = {
        resource: resource,
        level: level,
        time: new Date().getTime(),
    };
    let entry = log.entry(metaData, event);
    log.write(entry, logWritingError);
    if (params.debug === '1') {
        res.set('Content-Type', 'application/json; charset=ISO-8859-1');
        res.status(statusCodes.OK).send
         (JSON.stringify({
            message: 'OK\n',
            event: event,
        }));
    } else {
        res.sendStatus(statusCodes.NO_CONTENT);
    }
}

/**
 * Receive GET requests
 **/
router.get('/r', getHandler);
module.exports = getHandler;
