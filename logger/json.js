'use strict';

var common = require('./common'), util = require('./../lib/util'),
    fs = require('fs'), mainJson = { logs : [], testcases : [], errors : [], warnings : [] };

module.exports = function(args){
  args.logger = function(log){
    mainJson.logs.push(log);
  };
  args.testcaseLogger = function(log){
    mainJson.testcases.push(log);
  };
  args.errorLogger = function(log){
    mainJson.errors.push(log);
  };
  args.warningLogger = function(log){
    mainJson.warnings.push(log);
  };
  args.remarksLogger = function(log){
    mainJson.remarks = log;
  };
  args.reportsLogger = function(log){
    mainJson.report = log;
  };
  args.runner.on('done',function(){
    util.writeToFile(args.runner.filePath,mainJson);
  });
  common(args);
};
