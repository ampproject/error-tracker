/**
 * Copyright 2017 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 */


const chai = require('chai');
const chaihttp = require('chai-http');
const mocha = require('mocha');
const statusCodes = require('http-status-codes');
const app = require('../app');
const sinon = require('sinon');
const describe = mocha.describe;
const before = mocha.before;
const after = mocha.after;
const expect = chai.expect;
const it = mocha.it;

process.env.NODE_ENV = 'test';

chai.use(chaihttp);

describe('Test how server responds to requests/behave', function () {
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
  let randomVal = 1;
  before(function () {
    sinon.stub(Math, 'random').callsFake(function () {
      return randomVal;
    });
  });

  after(function () {
    Math.random.restore();
  });

  it('Should ignore 99% of user errors', function () {
    // set up parameters
    randomVal = 1;
    query.a = 1; // set explicitly to user error
    query.ca = 0; // canary errors cannot be throttled unless ca =0
    query.rt = '';
    query['3p'] = 0;
    return chai.request(app).get('/r').query(query).then(function (res) {
      expect(res).to.have.header('Content-Type', 'text/plain; charset=utf-8');
      expect(res).to.have.status(statusCodes.OK);
      expect(res.text).to.equal('THROTTLED\n');
    });
  });

  it('Should log 1% of user errors', function () {
    // modify query parameters to run test
    randomVal = 0.00000000000000001; // set sample to extremely small.
    query.a = 1;
    query.ca = 0;
    query.debug = 1;
    return chai.request(app).get('/r').query(query).then(function (res) {
      expect(res).to.have.status(statusCodes.OK);
      expect(res).to.have.header('Content-Type', 'application/json; charset=utf-8');
      let payload = JSON.parse(res.text);
      expect(payload.event.serviceContext.version).to.includes('assert');
      expect(payload.message).to.equal('OK\n');
      expect(payload.throttleRate).to.equal(0.01);
    });
  });

  it('Should ignore 90% of 3p errors', function () {
    // adjust query parameters for test.
    query['3p'] = 1;
    randomVal = 1;
    query.ca = 0;
    query.a = 0;
    query.debug = 1;
    query.rt = '';
    return chai.request(app).get('/r').query(query).then(function (res) {
      expect(res).to.have.status(statusCodes.OK);
      expect(res).to.have.header('Content-Type', 'text/plain; charset=utf-8');
      expect(res.text).to.equal('THROTTLED\n');
    });
  });

  it('Should log 10% of 3p errors', function () {
    // adjust query parameters to mock this case
    query['3p'] = 1;
    randomVal = 0.00000000000000001;
    query.ca = 0;
    query.a = 0;
    query.debug = 1;
    query.rt = '';
    return chai.request(app).get('/r').query(query).then(function (res) {
      expect(res).to.have.status(statusCodes.OK);
      expect(res).to.have.header('Content-Type', 'application/json; charset=utf-8');
      let payload = JSON.parse(res.text);
      expect(payload.event.serviceContext.version).to.includes('3p');
      expect(payload.message).to.includes('OK\n');
      expect(payload.throttleRate).to.equal(0.1);
    });
  });

  it('Should ignore 90% of cdn errors', function () {
    // adjust query parameters to mock this case
    query['3p'] = 0;
    query.a = 0;
    query.ca = 0;
    query.debug = 1;
    query.r = 'https://cdn.ampproject.org/conferences';
    randomVal = 1;
    return chai.request(app).get('/r').query(query).then(function (res) {
      expect(res).to.have.status(statusCodes.OK);
      expect(res).to.have.header('Content-Type', 'text/plain; charset=utf-8');
      expect(res.text).to.equal('THROTTLED\n');
    });
  });

  it('Should log 10% of cdn errors', function () {
    // adjust query parameters to mock this case
    query['3p'] = 0;
    query.a = 0;
    query.ca = 0;
    query.debug = 1;
    query.r = 'https://cdn.ampproject.org/conferences';
    randomVal = 0.00000000000000001;
    return chai.request(app).get('/r').query(query).then(function (res) {
      expect(res).to.have.status(statusCodes.OK);
      expect(res).to.have.header('Content-Type', 'application/json; charset=utf-8');
      let payload = JSON.parse(res.text);
      expect(payload.event.serviceContext.version).includes('cdn');
      expect(payload.message === 'OK\n');
      expect(payload.throttleRate).to.equal(0.1);
    });
  });

  it('Should log all canary errors ', function () {
    // adjust query parameters to
    query.a = 0;
    query.ca = 1;
    query['3p'] = 0;
    query.debug = 1;
    query.r = 'referer';
    randomVal = 0.00000000000000001;
    return chai.request(app).get('/r').query(query).then(function (res) {
      expect(res).to.have.status(statusCodes.OK);
      expect(res).to.have.header('Content-Type', 'application/json; charset=utf-8');
      let payload = JSON.parse(res.text);
      expect(payload.event.serviceContext.version).includes('canary');
      expect(payload.message === 'OK\n');
      expect(payload.throttleRate).to.equal(1);
    });
  });

  it('Should not log errors missing exception and message', function () {
    // adjust query parameters to mock this case
    randomVal = 0.00000000000000001;
    query.a = 0;
    query.ca = 1;
    query['3p'] = 0;
    query.s = '';
    query.m = '';
    query.debug = 1;
    query.r = 'referer';
    return chai.request(app).get('/r').query(query).then(function (res) {
      throw new Error('Unreachable');
    }, function (res) {
      /** chai-http errors with handling > 299 status codes hence errors can only
       *  be asserted in the catch block which modifies anatomy of response
       *  object. More information at https://github.com/chaijs/chai-http/issues/75.
       *  This is a hack and once the package has been updated is subject to
       *  change
       **/
      expect(res).to.have.property('status', statusCodes.BAD_REQUEST);
      let payload = JSON.parse(res.response.text);
      expect(payload.error).to.equal('One of \'message\' or \'exception\' must be present.');
    });
  });

  it('Should ignore testing traffic', function () {
    // adjust query parameters to mock this case.
    randomVal = 0.00000000000000001;
    query.a = 0;
    query.ca = 1;
    query['3p'] = 0;
    query.s = 'exception';
    query.m = 'message';
    query.debug = 1;
    query.r = 'referer';
    query.m = 'message';
    query.v = '$internalRuntimeVersion$';
    return chai.request(app).get('/r').query(query).then(function (res) {
      expect(res).to.have.status(statusCodes.NO_CONTENT);
    });
  });

  it('Should ignore filtered messages or exceptions', function () {
    // adjust query parameters to mock this case
    randomVal = 0.00000000000000001;
    query.a = 0;
    query.ca = 1;
    query['3p'] = 0;
    query.s = 'I null%20is%20not%20an%20object%20(evaluating%20%27elt.parentNode%27) exception';
    query.debug = 1;
    query.r = 'referer';
    query.m = 'I stop_youtube';
    query.v = 'version';
    return chai.request(app).get('/r').query(query).then(function (res) {
      throw new Error('Unreachable');
    }, function (res) {
      /** chai-http errors with handling > 299 status codes hence errors can only be
       * asserted in the catch block which modifies anatomy of response
       * object. More information at https://github.com/chaijs/chai-http/issues/75.
       * This is a hack and once the package
       * has been updated is subject to change
       **/
      expect(res).to.have.status(statusCodes.BAD_REQUEST);
      expect(res.response).to.have.header('content-Type', 'text/plain; charset=utf-8');
      expect(res.response.text).to.equal('IGNORE\n');
    });
  });

  it('Should ignore debug errors', function () {
    // adjust query parameters to mock this case
    randomVal = 0.00000000000000001;
    query.a = 0;
    query.ca = 1;
    query['3p'] = 0;
    query.s = 'exception';
    query.debug = 0;
    query.r = 'referer';
    query.m = 'message';
    return chai.request(app).get('/r').query(query).then(function (res) {
      expect(res).to.have.status(statusCodes.NO_CONTENT);
      //try
    });
  });
});

