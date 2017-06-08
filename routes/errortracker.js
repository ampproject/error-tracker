/**
 * Created by rigwanzojunior on 6/5/17.
 *objects used
 * type ErrorRequestMeta struct {
	HTTPReferrer  string `json:"http_referrer,omitempty"`
	HTTPUserAgent string `json:"http_user_agent,omitempty"`
    }

 type ErrorRequest struct {
	URL    string            `json:"url,omitempty"`
	Method string            `json:"method,omitempty"`
	Meta   *ErrorRequestMeta `json:"meta,omitempty"`
 }

 type ErrorEvent struct {
	Application string `json:"application,omitempty"`
	AppID       string `json:"app_id,omitempty"`
	Environment string `json:"environment,omitempty"`
	Version     string `json:"version,omitempty"`

	Message   string `json:"message,omitempty"`
	Exception string `json:"exception,omitempty"`

	Request *ErrorRequest `json:"request,omitempty"`

	Filename  string `json:"filename,omitempty"`
	Line      int32  `json:"line,omitempty"`
	Classname string `json:"classname,omitempty"`
	Function  string `json:"function,omitempty"`
	Severity  string `json:"severity,omitempty"`
 }
 * Handle error requests from clients and log them.
 */
const projectId ='';
const logName = 'javascript.errors';
const express = require('express');
const router = require('routes');
const logging = require('@google-cloud/logging');
const loggingClient = logging({
    projectId:projectId

});
const log = loggingClient.log(logName);
const url = require('url');


/**
 *
 * @param req
 * @param res
 * @param next
 */
function getHandler(req,res,next){
    var params = url.parse(req.url, true).query;


}

/**
 * Receive GET requests
 **/
router.get('/r',getHandler(req,res,next));
module.exports = router;
