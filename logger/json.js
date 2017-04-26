'use strict';

var common = require('./common'), util = require('./../lib/util'), fs = require('fs');

var mainFile = [];

module.exports = function(args){
  args.logger = function(log){
    console.log(log);
  };
  args.runner.once('after-post-run',function(ob){
    mainFile.push(JSON.parse(JSON.stringify(ob)));
    mainFile[0].detailedReport = [];
  });
  args.runner.once('after-post-tc',function(ob){
    mainFile[0].detailedReport.push(ob);
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
  };
  args.reportsLogger = function(log){
  };
  args.runner.on('done',function(){
    util.writeToFile(args.runner.filePath, util.stringify(mainFile, ' '));
  });
  common(args);
};
