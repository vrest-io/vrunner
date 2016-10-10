'use strict';

var common = require('./common'), util = require('./../lib/util'),
    fs = require('fs'), mainString = ['"Test Case Id",Summary,URL,Method,Executed?,Passed?,"Response Time(ms)",Remarks'];

module.exports = function(args){
  args.logger = function(log){
    console.log(log);
  };
  args.testcaseLogger = function(log,tc,trtc,stats){
    var toPush = [];
    toPush.push(trtc.testCaseId);
    toPush.push(tc.summary);
    toPush.push(trtc.runnerCase.url);
    toPush.push(trtc.runnerCase.method);
    toPush.push(trtc.isExecuted ? 'Yes':'No');
    toPush.push(trtc.isPassed ? 'Yes':'No');
    toPush.push(trtc.executionTime);
    toPush.push(trtc.remarks.replace(',','\,'));
    mainString.push(toPush.join(','));
  };
  args.errorLogger = function(log){
    console.log(log);
  };
  args.warningLogger = function(log){
    console.log(log);
  };
  args.remarksLogger = function(log){
  };
  args.reportsLogger = function(log){
  };
  args.runner.on('done',function(){
    util.writeToFile(args.runner.filePath, (mainString.join('\n')));
  });
  common(args);
};
