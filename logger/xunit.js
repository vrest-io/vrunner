
'use strict';

var common = require('./common'), util = require('./../lib/util'), xml2js = require('xml2js'),
    builder = new xml2js.Builder({cdata : true}), fs = require('fs'),
    testSuitesMap = {},
    tsResultsMap = {},
    mainJson = {
      testrun : {
        '$': {
          name : 'vrest_run',
          timestamp : new Date().toGMTString()
        },
        testsuite : [
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
  args.runner.once('testsuites',function(mp){
    testSuitesMap = mp;
  });
  args.runner.once('testrun',function(mp){
    mainJson.testrun.$.name = mp.name;
    mainJson.testrun.$.id = mp.id;
  });
  args.testcaseLogger = function(log,tc,trtc){
    var data = {
      '$' : {
        name : ' ' + tc.method + ' ' + tc.url,
        classname : tc.summary || 'No Summary',
        time : String(trtc.executionTime/1000)
      }
    };
    var incIn = 'not-executed', incCd = 2;
    if(trtc.isExecuted){
      if(trtc.isPassed){
        incIn = 'passed'; incCd = 1;
        data.$.message = 'PASSED';
      } else {
        incIn = 'failed'; incCd = 0;
        data.$.message = 'FAILED';
        data.failure = 'API Endpoint: ' + tc.url+ (tc.summary ? ('\nSummary: ' +tc.summary) : '')+'\nDetailed Info : '+
              getDescUrl(args.runner,trtc.testRunId,tc.id)+(trtc.remarks ? ('\nRemarks : '+trtc.remarks) : '');
      }
    } else {
      data.$.message = 'NOT_EXECUTED';
      if(trtc.remarks) data.error = trtc.remarks;
    }
    if(!Array.isArray(tsResultsMap[tc.testSuiteId])){
      tsResultsMap[tc.testSuiteId] = {
        "$" : {
          name : testSuitesMap[tc.testSuiteId] || tc.testSuiteId,
          id : tc.testSuiteId,
          passed : (incCd === 1) ? 1 : 0,
          failed : (incCd === 0) ? 1 : 0,
          'not-executed' : (incCd === 2) ? 1 : 0
        },
        testcase : [data]
      };
    } else {
      tsResultsMap[tc.testSuiteId].testcase.push(data);
      tsResultsMap[tc.testSuiteId][incIn]++;
    }
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
    mainJson.testrun.$.tests = log.total;
    mainJson.testrun.$.failures = log.failed;
    mainJson.testrun.$.skipped = log.notExecuted + log.notRunnable;
  };
  args.runner.on('done',function(){
    for(var ky in tsResultsMap){
      mainJson.testrun.testsuite.push(tsResultsMap[ky]);
    }
    util.writeToFile(args.runner.filePath, builder.buildObject(mainJson));
  });
  common(args);
};
