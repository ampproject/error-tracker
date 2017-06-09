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
const should = chai.should;
const expect = chai.expect;
const it = mocha.it;
const assert = require('assert');
const Math = require('../routes/Math');
chai.use(chaihttp);

describe('Test throttling', function() {
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
    before(function() {
         //app.listen(3001);
    });

    after(function() {
       // app.close();
    });
    beforeEach(function() {

    });

    it('Should ignore 99% of user errors', function(done) {
        //set up parameters
        Math.randomVal = 1;
        query.ca = 0; //canary errors cannot be throttled unless ca =0
        query.rt ='';
        query['3p'] = 0;
        chai.request(app).get('/r').query(query).end(function(err, res) {
            expect(res).to.have.header('Content-Type', 'text/plain; charset=utf-8');
            expect(res).to.have.status(statusCodes.OK);
            console.log(res.body);
            expect(res.statusMessage).to.equal("THROTTLED\n");
        });
        done();
    });

    it('Should log 1% of user errors', function(done) {
       // modify query parameters to run test
        Math.randomVal = 0.5;
       query.a = 1;
       query.debug = 1;
        chai.use(chaihttp).request(app).get('/r').query(query).end(function(err, res) {
           let body = JSON.parse(res.body);
           expect(res).to.have.status(statusCodes.INTERNAL_SERVER_ERROR) || (expect(res).to.have.header('Content-Type', 'application/json; charset=ISO-8859-1') &&
           expect(res).to.have.status(statusCodes.OK));
           expect(body.message).to.equal('OK\n');
           expect(body.event.Application).to.include('assert');
       });
       done();
    });

    it('Should ignore 90% of 3p errors', function(done) {
        // adjust query parameters for test. Don't forget to adjust math.random to extremely small
        query['3p'] = 1;

        done();
    });

   afterEach(function() {

    });
});


