#!/usr/bin/env node

var vrunner = require('./../index'), options = {
  logger : 'console',
  credentials : {
    email : process.env.VREST_EMAIL,
    password : process.env.VREST_PASSWORD
  },
  url: process.env.VREST_URL
}, Runner = (new vrunner(options));

Runner.run();
