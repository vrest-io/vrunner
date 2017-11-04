/**
 *  Supports the following XSDs
 *    * https://github.com/jenkinsci/xunit-plugin/blob/master/src/main/resources/org/jenkinsci/plugins/xunit/types/model/xsd/junit-8.xsd
 *    * https://github.com/jenkinsci/xunit-plugin/blob/master/src/main/resources/org/jenkinsci/plugins/xunit/types/model/xsd/junit-9.xsd
 *    * https://github.com/jenkinsci/xunit-plugin/blob/master/src/main/resources/org/jenkinsci/plugins/xunit/types/model/xsd/junit-10.xsd
 */

'use strict';

var common = require('./common'), util = require('./../lib/util'), xml2js = require('xml2js'),
    builder = new xml2js.Builder({cdata : true}), fs = require('fs'),
    testSuitesMap = {},
    tsResultsMap = {},
    mainJson = {
      testsuites : {
        '$': {
          name : 'vrest_run'
        },
        testsuite : [
        ]
      }
    };

var getDescUrl = function(runner,tr,tc){
  return runner.instanceURL+'/'+runner.projectKey+'/testcase?testRunId='+tr+'&showResponse=true&queryText='+tc;
};

module.exports = function(args){
  var properties = {};
  args.logger = function(log){
    console.log(log);
  };
  args.runner.once('testsuites',function(mp){
    testSuitesMap = mp;
  });
  args.runner.once('testrun',function(mp){
    properties = {
      property: [
        { $ : {name: 'environment', value: mp.environment || 'Default'}}
      ]
    };
    mainJson.testsuites.$.name = mp.name;
    //mainJson.testsuites.$.id = mp.id;
  });
  args.testcaseLogger = function(log,tc,trtc){
    var time = trtc.executionTime/1000;
    var data = {
      '$' : {
        name : ' ' + tc.method + ' ' + tc.url,
        classname : tc.summary || 'No Summary',
        time : String(time)
      }
    };
    var incIn = 'disabled', incCd = 2;
    if(trtc.isExecuted){
      if(trtc.isPassed){
        incIn = 'passed'; incCd = 1;
        //data.$.status = 'PASSED';
        //data.$.message = 'PASSED';
      } else {
        incIn = 'failures'; incCd = 0;
        //data.$.status = 'FAILED';
        //data.$.message = 'FAILED';
        data.failure = {
          _: 'API Endpoint: ' + tc.url+ (tc.summary ? ('\nSummary: ' +tc.summary) : '')+'\nDetailed Info : '+
              getDescUrl(args.runner,trtc.testRunId,tc.id)+(trtc.remarks ? ('\nRemarks : '+trtc.remarks) : ''),
          $: {
            type: "FAILURE"
          }
        }
      }
    } else if(!tc.runnable) { //if tc is not runnable
      data.skipped = {};
      //data.$.status = 'NOT_EXECUTED';
      //data.$.message = 'NOT_EXECUTED';
    } else { //if tc was not executed due to some other reasons
      //data.$.status = 'NOT_EXECUTED';
      //data.$.message = 'NOT_EXECUTED';
      if(trtc.remarks) data.error = trtc.remarks;
    }
    if(!tsResultsMap[tc.testSuiteId]){
      var date = new Date().toISOString();
      tsResultsMap[tc.testSuiteId] = {
        "$" : {
          name : testSuitesMap[tc.testSuiteId] || tc.testSuiteId,
          id : tc.testSuiteId,
          timestamp : date.substring(0, date.length - 5),
          time: time,
          tests: 1,
          failures : (incCd === 0) ? 1 : 0,
          disabled : (incCd === 2) ? 1 : 0
        },
        properties: properties,
        testcase : [data]
      };
    } else {
      tsResultsMap[tc.testSuiteId].testcase.push(data);
      tsResultsMap[tc.testSuiteId].$.tests++;
      tsResultsMap[tc.testSuiteId].$.time += time;
      if(incIn !== "passed"){
        tsResultsMap[tc.testSuiteId].$[incIn]++;
      }
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
    mainJson.testsuites.$.tests = log.total;
    mainJson.testsuites.$.failures = log.failed;
    mainJson.testsuites.$.disabled = log.notExecuted + log.notRunnable;
  };
  args.runner.once('done',function(){
    for(var ky in tsResultsMap){
      mainJson.testsuites.testsuite.push(tsResultsMap[ky]);
    }
    util.writeToFile(args.runner.filePath, builder.buildObject(mainJson));
  });
  common(args);
};
