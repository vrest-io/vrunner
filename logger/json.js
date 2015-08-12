'use strict';

var common = require('./common'), util = require('./../lib/util'),
    fs = require('fs'), mainJson = { logs : [], testcases : [], errors : [], warnings : [] };

module.exports = function(args){
  args.logger = function(log){
    console.log(log);
  };
  args.testcaseLogger = function(log){
    mainJson.testcases.push(log);
  };
  args.errorLogger = function(log){
    console.log(log);
  };
  args.warningLogger = function(log){
    console.log(log);
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
