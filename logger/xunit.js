
'use strict';

var common = require('./common'), util = require('./../lib/util'), xml2js = require('xml2js'),
    builder = new xml2js.Builder({cdata : true, renderOpts : { 'pretty': true, 'indent': ' ' }}), fs = require('fs'),
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
    //mainJson.logs.push(log);
  };
  args.testcaseLogger = function(log,tc,trtc){
    var data = {
      '$' : {
        classname : tc.method + ' ' + tc.url,
        name : tc.summary || '',
        time : String(trtc.executionTime/1000)
      }
    };
    if(trtc.isExecuted){
      if(trtc.isPassed){
        data.$.message = 'PASSED';
      } else {
        data.$.message = 'FAILED';
        data.failure = '<pre>API Endpoint: ' + tc.url+ (tc.summary ? ('\nSummary: ' +tc.summary) : '')+'\nDetailed Info : '+
              getDescUrl(args.runner,trtc.testRunId,tc.id)+(trtc.remarks ? ('\nRemarks : '+trtc.remarks) : '')+'</pre>';
      }
    } else {
      data.$.message = 'NOT_EXECUTED';
      if(trtc.remarks) data.error = '<pre>'+trtc.remarks+'</pre>';
    }
    mainJson.testsuite.testcase.push(data);
  };
  args.errorLogger = function(log){
    //mainJson.errors.push(log);
  };
  args.warningLogger = function(log){
    //mainJson.warnings.push(log);
  };
  args.remarksLogger = function(log){
    //mainJson.remarks = log;
  };
  args.reportsLogger = function(log){
    mainJson.testsuite.$.tests = log.total;
    mainJson.testsuite.$.failures = log.failed;
    mainJson.testsuite.$.skippeds = log.notExecuted;
  };
  args.runner.on('done',function(){
    util.writeToFile(args.runner.filePath,builder.buildObject(mainJson));
  });
  common(args);
};
