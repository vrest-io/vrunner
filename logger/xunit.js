
'use strict';

var common = require('./common'), util = require('./../lib/util'), xml2js = require('xml2js'),
    builder = new xml2js.Builder({cdata : true}), fs = require('fs'),
    mainJson = {
      testsuite : {
        '$': {
          name : 'vrest_tests',
          timestamp : new Date().toGMTString()
        },
        testcase : [
        ]
      }
    };

var getDescUrl = function(runner,tr,tc){
  return runner.instanceURL+'/'+runner.projectKey+'/testcase?testRunId='+tr+'&showResponse=true&queryText='+tc;
};

module.exports = function(args){
  args.logger = function(log){
    console.log(log);
  };
  args.testcaseLogger = function(log,tc,trtc){
    var data = {
      '$' : {
        name : ' ' + tc.method + ' ' + tc.url,
        classname : tc.summary || 'No Summary',
        time : String(trtc.executionTime/1000)
      }
    };
    if(trtc.isExecuted){
      if(trtc.isPassed){
        data.$.message = 'PASSED';
      } else {
        data.$.message = 'FAILED';
        data.failure = 'API Endpoint: ' + tc.url+ (tc.summary ? ('\nSummary: ' +tc.summary) : '')+'\nDetailed Info : '+
              getDescUrl(args.runner,trtc.testRunId,tc.id)+(trtc.remarks ? ('\nRemarks : '+trtc.remarks) : '');
      }
    } else {
      data.$.message = 'NOT_EXECUTED';
      if(trtc.remarks) data.error = trtc.remarks;
    }
    mainJson.testsuite.testcase.push(data);
  };
  args.errorLogger = function(log){
    console.log(log);
  };
  args.warningLogger = function(log){
    console.log(log);
  };
  args.remarksLogger = function(log){
    //mainJson.remarks = log;
  };
  args.reportsLogger = function(log){
    mainJson.testsuite.$.tests = log.total;
    mainJson.testsuite.$.failures = log.failed;
    mainJson.testsuite.$.skipped = log.notExecuted;
  };
  args.runner.on('done',function(){
    util.writeToFile(args.runner.filePath, builder.buildObject(mainJson));
  });
  common(args);
};
