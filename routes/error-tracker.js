/**
 * Copyright 2017 The AMP Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 **/

/**
 * objects used
 * Objects are identical to the objects used in previous errortracker.go
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
 **/

 /**
 * Handle error requests from clients and log them.
 **/

const express = require('express');
const logging = require('@google-cloud/logging');
const winston = require('winston');
const statusCodes = require('http-status-codes');
const url = require('url');
const router = express.Router();
const appEngineProjectId = '';
const logName = 'javascript.errors';
/**
 * ERROR_LEVELS
 * @enum {string}
 */
const ERROR_LEVELS = {
    DEFAULT: 'Default',
    DEBUG: 'Debug',
    INFO: 'Info',
    NOTICE: 'Notice',
    WARNING: 'Warning',
    ERROR: 'Error',
    CRITICAL: 'Critical',
    ALERT: 'Alert',
    EMERGENCY: 'Emergency',
};


/**
 * @desc Filter exceptions in an array to prevent them from being logged
 * @param errorEvent
 * @returns {boolean}
 */
function isFilteredMessageOrException(errorEvent) {
    let filteredMessageOrException = ['stop_youtube',
        'null%20is%20not%20an%20object%20(evaluating%20%27elt.parentNode%27)'];
    return filteredMessageOrException.some(function filter(msg) {
        return errorEvent.message.includes(msg) ||
            errorEvent.exception.includes(msg);
    });


}

/**
 * @desc handle errors that come from an attempt to write to the logs
 * @param err error
 * @param res http response object
 * @param req http request object
 */
function logWritingError(err,res,req) {
    if (err) {
        res.status(statusCodes.INTERNAL_SERVER_ERROR).send({error: 'Cannot write to Google Cloud Logging'});
        winston.error(appEngineProjectId, 'Cannot write to Google Cloud Logging: '+url.parse(req.url, true).query['v'], err);
    }
}

/**
 * @desc extract params in GET request from query and fill errorEvent object
 * log level by default is INFO.
 * @param req
 * @param res
 * @param next
 */
function getHandler(req, res, next) {

    let params = req.query;
    let referer = params.r;
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
    if (params.a === '1') {
        errorType = 'assert';
        isUserError = true;
    }

    let severity = 'INFO';
    let level = ERROR_LEVELS.INFO;
    // if request comes from the cache and thus only from valid AMP docs we log as "Error"
    let isCdn = false;
    if (referer.startsWith('https://cdn.ampproject.org/') ||
        referer.includes('.cdn.ampproject.org/') ||
        referer.includes('.ampproject.net/')) {
        severity = 'ERROR';
        level = ERROR_LEVELS.ERROR;
        errorType += '-cdn';
        isCdn = true;
    } else {
        errorType += '-origin';
    }
    let is3p = false;
    let runtime = params.rt;
    if (runtime) {
        errorType += '-' + runtime;
        if (runtime === 'inabox') {
            severity = 'ERROR';
            level = ERROR_LEVELS.ERROR;
        }
        if (runtime === '3p') {
            is3p = true;
        }

    } else {
        if (params['3p'] === '1') {
            is3p = true;
            errorType += '-3p';
        } else {
            errorType += '-1p';
        }

    }
    let isCanary = false;
    if (params.ca === '1') {
        errorType += '-canary';
        isCanary = true;
    }

    if (params.ex === '1') {
        errorType += '-expected';
    }
    let sample = Math.random();
    let throttleRate = 0.1;

    if (isCanary) {
        throttleRate = 1.0; // explicitly log all errors
    } else if (is3p) {
        throttleRate = 0.1;
    } else if (isCdn) {
        throttleRate = 0.1;
    }

    if (isUserError) {
        throttleRate =throttleRate / 10;
    }

    if (sample > throttleRate) {
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.status(statusCodes.OK).send('THROTTLED\n').end();
        return;
    }
    let exception = params.s;
    let reg = /:\d+$/;
    // If format does not end with :\d+ truncate up to the last newline.
    if (!exception.match(reg)) {
        exception = exception.replace(/\n.*$/, '');

    }

    // errorEvent object defined at the beginning.
    let event = {
        message: params.m,
        exception: exception,
        version: errorType + '-' + params.v,
        environment: 'prod',
        application: errorType,
        appID: appEngineProjectId,
        filename: req.url.toString(),
        line: parseInt(line),
        classname: params.el,
        severity: severity,

    };

    if (event.message === '' && event.exception === '') {
        res.status(statusCodes.BAD_REQUEST).send({error: 'One of \'message\' or \'exception\' must be present.'}).end();
        winston.log(ERROR_LEVELS.ERROR, 'Malformed request: ' + params.v.toString(), event);
        return;
    }

    if (isFilteredMessageOrException(event)) {
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.status(statusCodes.BAD_REQUEST).send('IGNORE\n').end();
        return;
    }

    // Don't log testing traffic in production
    if (event.version.includes('$internalRuntimeVersion$')) {
        res.sendStatus(statusCodes.NO_CONTENT).end();
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
        projectId: appEngineProjectId,
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
             throttleRate:throttleRate,
         }));
    } else {
        res.sendStatus(statusCodes.NO_CONTENT);
    }
    next();
}

/**
 * Receive GET requests
 **/
router.get('/r', getHandler);
module.exports = getHandler;
