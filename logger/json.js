'use strict';

var common = require('./common'), util = require('./../lib/util'), fs = require('fs');

var mainFile = {}, tcs = [];

module.exports = function(args){
  args.logger = function(log){
    console.log(log);
  };
  args.runner.once('after-post-run',function(ob){
    mainFile = JSON.parse(JSON.stringify(ob));
    mainFile.detailedReport = tcs;
  });
  args.runner.on('after-post-tc',function(ob){
    var ob = JSON.parse(JSON.stringify(ob));
    if(ob.execution.request.body){
      ob.execution.request.body = util.getStringToRender(ob.execution.request.body);
    }
    if(ob.execution.response.body){
      ob.execution.response.body = util.getStringToRender(ob.execution.response.body);
    }
    tcs.push(ob);
  });
  args.testcaseLogger = function(log,tc,trtc,stats){
  };
  args.errorLogger = function(log){
    console.log(log);
  };
  args.warningLogger = function(log){
    console.log(log);
  };
  args.remarksLogger = function(log){
    mainFile.result.remarks = log;
  };
  args.reportsLogger = function(log){
  };
  args.runner.on('done',function(){
    util.writeToFile(args.runner.filePath, util.stringify(mainFile, '  '));
  });
  common(args);
};
