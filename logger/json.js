'use strict';

var common = require('./common'), util = require('./../lib/util'),
    fs = require('fs'), mainJson = { logs : [], testcases : [], errors : [], warnings : [] };

module.exports = function(args){
  args.logger = function(log){
    console.log(log);
  };
  args.testcaseLogger = function(log,tc,trtc,stats){
    var toPush = { isExecuted : trtc.isExecuted, isPassed : trtc.isPassed, summary : tc.summary, runnerCase : trtc.runnerCase,
      detailedInfoURL : args.runner.instanceURL + '/' + args.runner.projectKey +
        '/testcase?testRunId='+trtc.testRunId+'&showResponse=true&queryText='+trtc.testCaseId };
    mainJson.testcases.push(toPush);
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
    mainJson.testRunName = args.runner.testRunName;
    mainJson.testRunLink = args.runner.instanceURL + '/' + args.runner.projectKey + '/testcase?testRunId='+args.runner.testRunId;
  };
  args.runner.on('done',function(){
    util.writeToFile(args.runner.filePath, util.stringify(mainJson, ' '));
  });
  common(args);
};
