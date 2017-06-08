/**
 * Created by rigwanzojunior on 6/7/17.
 * Stub out Math.Random for testing
 */

const express = require('express');
const router = express.Router();
let randomVal = 0.0000000000000000000000001;

function random() {
    return randomVal;
}

module.exports = [router, random, randomVal];
