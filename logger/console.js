'use strict';

var common = require('./common');

module.exports = function(args){
  args.logger = console.log;
  args.testcaseLogger = console.log;
  args.errorLogger = console.log;
  args.remarksLogger = console.log;
  args.reportsLogger = console.log;
  args.warningLogger = console.log;
  common(args);
};
