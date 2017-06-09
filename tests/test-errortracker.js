/**
 * Created by rigwanzojunior on 6/7/17.
 */

const express = require('express');
const chai = require('chai');
const chaihttp = require('chai-http');
const mocha = require('mocha');
const statusCodes = require('http-status-codes');
const describe = mocha.describe;
const before = mocha.before;
const after = mocha.after;
const beforeEach = mocha.beforeEach;
const afterEach = mocha.afterEach;
const app = require('../app');
process.env.NODE_ENV = 'test';
const expect = chai.expect;
const it = mocha.it;
const assert = require('assert');
const Math = require('./Math');
chai.use(chaihttp);

describe('Test how server responds to requests/behave', function() {
    let query = {
        'l': 12,
        'a': 1,
        'rt': 'inabox',
        '3p': 1,
        'ca': 1,
        'ex': 1,
        's': 'exception',
        'm': 'message',
        'v': 'version',
        'el': 'classname',
        'r': 'referrer',
        'debug': 1,


    };
    // start HTTP server
    before(function () {
        //app.listen(3001);
    });

    after(function () {
        // app.close();
    });
    beforeEach(function () {

    });

    it('Should ignore 99% of user errors', function (done) {
        //set up parameters
        Math.randomVal = 1;
        query.a = 1; //set explicitly to usererror
        query.ca = 0; //canary errors cannot be throttled unless ca =0
        query.rt = '';
        query['3p'] = 0;
        chai.request(app).get('/r').query(query).end(function (err, res) {
            expect(res).to.have.header('Content-Type', 'text/plain; charset=utf-8');
            expect(res).to.have.status(statusCodes.OK);
            expect(res.text).to.equal('THROTTLED\n');
        });
        done();
    });

    it('Should log 1% of user errors', function (done) {
        // modify query parameters to run test
        Math.randomVal = 0.00000000000000001; //set sample to extremely small.
        query.a = 1;
        query.ca = 0;
        query.debug = 1;
        chai.use(chaihttp).request(app).get('/r').query(query).end(function (err, res) {
            expect(res).to.have.status(statusCodes.OK);
            expect(res).to.have.header('Content-Type', 'application/json; charset=utf-8');
            let payload = JSON.parse(res.text);
            assert(payload.event.application.includes('assert'), 'Its a user error');
            assert(payload.message === 'OK\n', 'its been logged');
            assert(payload.throttleRate === 0.01);
            done();
        });
    });

    it('Should ignore 90% of 3p errors', function (done) {
            // adjust query parameters for test. Don't forget to adjust math.random to extremely small
        query['3p'] = 1;
        Math.randomVal = 1;
        query.ca = 0;
        query.a = 0;
        query.debug = 1;
        chai.use(chaihttp).request(app).get('/r').query(query).end(function (err, res) {
            expect(res).to.have.status(statusCodes.OK);
            expect(res).to.have.header('Content-Type', 'text/plain; charset=utf-8');
            assert(res.text === 'THROTTLED\n');

        });
        done();
    });
    it('Should log 10% of 3p errors', function (done) {
        //adjust query parameters to mock this case
        query['3p'] = 1;
        Math.randomVal = 0.00000000000000001;
        query.ca =0;
        query.a = 0;
        query.debug = 1;
        chai.use(chaihttp).request(app).get('/r').query(query).end(function (err,res) {
            expect(res).to.have.status(statusCodes.OK);
            expect(res).to.have.header('Content-Type', 'application/json; charset=utf-8');
            let payload = JSON.parse(res.text);
            assert(payload.event.application.includes('3p'),'its a 3pm error');
            assert(payload.message === 'OK\n', 'Its been logged');
            assert(payload.throttleRate === 0.1, 'Logged at the correct rate ');

        });
        done();

    });
    it('Should ignore 90% of cdn errors', function (done) {
        //adjust query parameters to mock this case
        query['3p'] = 0;
        query.a = 0;
        query.ca = 0;
        query.debug = 1;
        query.r = 'https://cdn.ampproject.org/conferences';
        Math.randomVal = 1;
        chai.use(chaihttp).request(app).get('/r').query(query).end(function (err,res) {
            expect(res).to.have.status(statusCodes.OK);
            expect(res).to.have.header('Content-Type', 'text/plain; charset=utf-8');
            assert(res.text === 'THROTTLED\n');
        });
        done();

    });
    it('Should log 10% of cdn errors', function (done) {
        //adjust query parameters to mock this case
        query['3p'] = 0;
        query.a = 0;
        query.ca = 0;
        query.debug = 1;
        query.r = 'https://cdn.ampproject.org/conferences';
        Math.randomVal = 0.00000000000000001;
        chai.use(chaihttp).request(app).get('/r').query(query).end(function (err, res) {
            expect(res).to.have.status(statusCodes.OK);
            expect(res).to.have.header('Content-Type', 'application/json; charset=utf-8');
            let payload = JSON.parse(res.text);
            assert(payload.event.application.includes('cdn'),'Its a cdn error');
            assert(payload.message==='OK\n', 'Its been logged');
            assert(payload.throttleRate === 0.1, 'logged at the correct rate');
        });
        done();

    });
    it('Should log all canary errors ', function (done) {
        //adjust query parameters to
        query.a = 0;
        query.ca = 1;
        query['3p'] =0;
        query.debug = 1;
        query.r = 'referer';
        Math.randomVal = 0.00000000000000001;
        chai.use(chaihttp).request(app).get('/r').query(query).end(function (err,res) {
            expect(res).to.have.status(statusCodes.OK);
            expect(res).to.have.header('Content-Type', 'application/json; charset=utf-8');
            let payload = JSON.parse(res.text);
            assert(payload.event.application.includes('canary'), 'its a canary error');
            assert(payload.message === 'OK\n', 'its been logged');
            assert(payload.throttleRate ===1, 'logged at the correct rate');
        });

        done();
    });
    it('Should not log errors missing exception and message', function (done) {
        //adjust query parameters to mock this case
        Math.randomVal = 0.00000000000000001;
        query.a = 0;
        query.ca = 1;
        query['3p'] =0;
        query.s = '';
        query.m = '';
        query.debug = 1;
        query.r = 'referer';
        chai.use(chaihttp).request(app).get('/r').query(query).end(function (err,res) {
            expect(res).to.have.status(statusCodes.BAD_REQUEST);
            let payload = JSON.parse(res.text);
            //expect(res.text).to.equal('');
            assert(payload.error === 'One of \'message\' or \'exception\' must be present.');
        });
        done();
    });

    it('Should ignore testing traffic', function (done) {
       //adjust query parameters to mock this case.
        Math.randomVal = 0.00000000000000001;
        query.a = 0;
        query.ca = 1;
        query['3p'] =0;
        query.s = 'exception';
        query.m = 'message';
        query.debug = 1;
        query.r = 'referer';
        query.m = 'message';
        query.v = '$internalRuntimeVersion$';
        chai.use(chaihttp).request(app).get('/r').query(query).end(function (err,res) {
            expect(res).to.have.status(statusCodes.NO_CONTENT);
        });

        done();
    });

    it('Should ignore filtered messages or exceptions', function (done) {
        //adjust query parameters to mock this case
        Math.randomVal = 0.00000000000000001;
        query.a = 0;
        query.ca = 1;
        query['3p'] =0;
        query.s = 'I null%20is%20not%20an%20object%20(evaluating%20%27elt.parentNode%27) exception';
        query.debug = 1;
        query.r = 'referer';
        query.m = 'I stop_youtube';
        query.v = 'version';
        chai.use(chaihttp).request(app).get('/r').query(query).end(function (err,res) {
            expect(res).to.have.status(statusCodes.BAD_REQUEST);
            expect(res).to.have.header('content-Type', 'text/plain; charset=utf-8');
            assert(res.text === 'IGNORE\n');
        });
        done();
    });

    it('Should ignore debug errors', function (done) {
        //adjust query parameters to mock this case
        Math.randomVal = 0.00000000000000001;
        query.a = 0;
        query.ca = 1;
        query['3p'] =0;
        query.s = 'exception';
        query.debug = 0;
        query.r = 'referer';
        query.m = 'message';
        chai.use(chaihttp).request(app).get('/r').query(query).end(function (err, res) {
            expect(res).to.have.status(statusCodes.NO_CONTENT);
        });
        done();
    });

    afterEach(function () {

    });

});
