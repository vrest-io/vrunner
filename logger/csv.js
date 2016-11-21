'use strict';

var common = require('./common'), util = require('./../lib/util'), fs = require('fs'),
    mainString = ['"Test Case Id","Summary","Method","URL","Status Code","Executed ?","Passed ?","Response Time (ms)","Remarks"'];

var replaceDouble = function(st){
  return '"'+String(st).replace(/\"/g, '""')+'"';
};

module.exports = function(args){
  args.logger = function(log){
    console.log(log);
  };
  args.testcaseLogger = function(log,tc,trtc,stats){
    var toPush = [];
    toPush.push(trtc.testCaseId);
    toPush.push(replaceDouble(tc.summary));
    toPush.push((trtc.runnerCase || tc).method);
    toPush.push(replaceDouble((trtc.runnerCase || tc).url));
    toPush.push((trtc.result && trtc.result.statusCode) || 0);
    toPush.push(trtc.isExecuted ? 'Yes':'No');
    toPush.push(trtc.isPassed ? 'Yes':'No');
    toPush.push(trtc.executionTime);
    toPush.push(replaceDouble(trtc.remarks));
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
