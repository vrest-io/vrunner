/*
 * vrunner
 * http://vrest.io
 *
 * Copyright (c) 2015 vREST Team
 * Licensed under the MIT license.
 */

'use strict';

var request = require('request').defaults({jar: true,json:true}),
    zSchemaValidator = require('z-schema'),
    events = require('events'),
    jsonSchemaFiles = require('./lib/schemaFiles'),
    util = require('./lib/util'),
    runner = require('./lib/testRunner'),
    OAuth1 = require('./lib/oauth-1_0'),
    JSONPath = require('./lib/jsonpath'),
    btoa = require('btoa'),
    V_BASE_URL = 'http://vrest.io/',
    RUNNER_LIMIT = 5000,
    EMAIL_REGEX = /^\S+@\S+\.\S+$/,
    ORG_URL_PREFIX = 'i/',
    START_VAR_EXPR = '{{',
    END_VAR_EXPR = '}}',
    TRTC_BATCH = 5,
    MONGO_REGEX = /^[0-9a-fA-F]{24}$/,
    options = {
      credentials : {
      },
      pageSize : 100,
      methodCodes : {
      },
      authorizations : {
      },
      validatorIdCodeMap : {
      },
      variables : {
      }
    };

var getInstanceName = function(url){
  var instanceName = null, prefixIndex = url.indexOf(ORG_URL_PREFIX), prefixLength = ORG_URL_PREFIX.length, index;
  if(prefixIndex > -1){
    index = url.indexOf("/", prefixIndex + prefixLength);
    if(index > -1) instanceName = url.substring(prefixIndex + prefixLength, index);
    else instanceName = url.substring(prefixIndex + prefixLength);
  }
  return String(instanceName);
};

var fetchSinglePage = function(url,page,pageSize,af,cb,next, vrunner){
  vrunner.emit('log', 'Fetching page ' + (page+1) + ' (upto ' + pageSize + ' testcases) ...');
  request(url+'&pageSize='+pageSize+'&currentPage='+page, function(err,res,body){
    if(err || body.error) next(['Error found while fetching test cases at page '+page+' :', body]);
    else if(!util.isNumber(body.total) || body.total > RUNNER_LIMIT)
      next('More than '+RUNNER_LIMIT+ ' test cases can not be executed in one go.');
    else {
      if(typeof vrunner.totalRecords !== 'number') vrunner.totalRecords = body.total;
      af(body.output, body.total < (pageSize*(page+1)),url,page,pageSize,cb,next, vrunner);
    }
  });
};


var afterFetch = function(body,last,url,page,pageSize,cb,next, vrunner){
  util.recForEach({
    ar : body,
    ec : cb,
    finishOnError : true,
    cb : function(err){
      if(err) next(err);
      else if(last) next();
      else fetchSinglePage(url,(page+1),pageSize,afterFetch,cb,next, vrunner);
    }
  });
};

var fetchAndServe = function(url, pageSize, cb, next, vrunner){
  fetchSinglePage(url,0,pageSize,afterFetch,cb,next, vrunner);
};

var hasRunPermission = function(instance,project,next){
  request(V_BASE_URL+'user/hasPermission?permission=RUN_TEST_CASES&project='+project+'&instance='+instance,
  function(err,res,body){
    if(err || body.error) next(['Error while checking execute permission  :', err||body], 'VRUN_OVER');
    else if(!body.output) next('Internal permission error.', 'VRUN_OVER');
    else if(body.output.permit !== true) next('NO_PERMISSION_TO_RUN_TESTCASE_IN_PROJECT', 'VRUN_OVER');
    else next();
  });
};

var findHelpers = function(vrunner, what, next){
  vrunner.emit('log', 'Finding '+what+'s ...');
  var instanceURL = vrunner.instanceURL,
    projectId = vrunner.projectId;

  request(instanceURL+'/g/'+what+'?&projectId='+projectId,
    function(err,res,body){
      if(err || body.error) next(['Error while fetching '+what+'s :', err||body]);
      else {
        if(!Array.isArray(body.output)) body.output = [];
        next(null,body.output);
      }
  });
};

var createTestRun = function(instanceURL,filterData,next){
  var filters = util.cloneObject(filterData);
  filters.currentPage = 0;
  filters.pageSize = 100;
  request({ method: 'POST', uri: instanceURL+'/g/testrun',
    body: { name : util.getReadableDate(), projectId : true, filterData : filters } }, function(err,res,body){
      if(err || body.error) next(['Error while creating test run : ',err||body]);
      else next(null,body.output);
  });
};

var getBasicAuthHeader = function(ath){
  var authConfig = ath.authConfig || '', token = authConfig.username + ':' + authConfig.password;
  return 'Basic ' + btoa(token);
};

var completeURL = function(tc) {
  if(!tc || !tc.params || !tc.params.length) return tc;
  tc.url = util.completeURL(tc.url, tc.params);
  return tc;
};

var getOAuthTwoHeader = function(ath){
  var authConfig = ath.authConfig || {};
  return (authConfig.accessTokenType || 'OAuth') + ' ' + authConfig.accessToken;
};

var getAuthHeader = function(ath){
  var authType = ath.authType,
      authConfig = ath.authConfig || {};
  if(authType === 'basic'){
    return getBasicAuthHeader(ath);
  } else if(authType === 'raw'){
    return authConfig.authHeader || '';
  } else if(authType === 'oauth1.0'){
    var params = util.extractParamters(tc.params);
    return function(tc) {
      new OAuth1(authConfig, tc.method, util.completeURL(tc.url, params.query), params.body).getAuthHeader();
    };
  } else if(authType === 'oauth2.0'){
    return getOAuthTwoHeader(ath);
  }
};

var fireRequest = function(tc,trtc,callback){
  runner({ testcase : tc },function(result){
    if(!result || result.err) {
      //console.log(result);
    }
    trtc.executionTime = new Date().getTime() - trtc.executionTime;
    callback(result);
  });
};

var getContentType = function(responseHeaders){
  if(responseHeaders){
    return responseHeaders['Content-Type'] || responseHeaders['content-type'];
  }
  return null;
};

var getResultType = function(response) {
  var rType = 'text';
  var contentType = getContentType(response.headers);
  if(contentType){
    if(contentType.indexOf('json') != -1) {
      rType = 'json';
    } else if(contentType.indexOf('html') != -1) {
      rType = 'html';
    } else if(contentType.indexOf('xml') != -1) {
      rType = 'xml';
    }
  }
  return rType;
};

var getActualResults = function(response) {
  return {
    statusCode : response.statusCode,
    headers : util.mapToArray(response.headers),
    content: util.stringify(response.body, null, true),
    resultType: getResultType(response)
  };
};

var extractVarsFrom = function(tc, result, tcVar) {
  if(result && result.resultType){
    switch(result.resultType) {
      case 'json' :
        var jsonData = util.getJsonOrString(result.content);
        if(typeof(jsonData) != 'object') return;
        tc.tcVariables.forEach(function(vr){
          try {
            tcVar[vr.name] = JSONPath(util.getJsonOrString(result.content), vr.path);
          } catch(er) {
            return;
          }
          if(Array.isArray(tcVar[vr.name]) && tcVar[vr.name].length === 1)
            tcVar[vr.name] = tcVar[vr.name][0]; // TODO : how it was working earlier? jsonpath return array.
          if(typeof tcVar[vr.name] === 'object') tcVar[vr.name] = JSON.stringify(tcVar[vr.name]);
        });
        break;
      default :
        break;
    }
  }
  return;
};

var assertResults = function(toSendTC,runnerModel,variables,validatorIdCodeMap,methodCodes){
  var isPassed = false, actualResults = runnerModel.result, headers = runnerModel.result.headers;
  var jsonSchema = (toSendTC.expectedResults && toSendTC.expectedResults.contentSchema) || '{}';
  toSendTC.expectedResults.contentSchema = util.getJsonOrString(jsonSchema);
  toSendTC.expectedResults.content =
    util.searchAndReplaceString(toSendTC.expectedResults.content, util.cloneObject(variables),
        { startVarExpr : START_VAR_EXPR, endVarExpr : END_VAR_EXPR });
  var toSendTRTC = { headers : {} }, tcValId = String(toSendTC.responseValidatorId);
  toSendTRTC.actualResults = actualResults;
  headers.forEach(function(a){ toSendTRTC.headers[a.name] = a.value;  });
  if(typeof validatorIdCodeMap[tcValId] === 'function') {
    toSendTC.expectedResults.content =
      util.stringify(util.mergeObjects(util.getJsonOrString(toSendTC.expectedResults.content),
            util.getJsonOrString(toSendTRTC.actualResults.content),
            function(val){ return val === (START_VAR_EXPR + '*' + END_VAR_EXPR); }), null, true);
      isPassed = validatorIdCodeMap[tcValId](toSendTC, toSendTRTC, methodCodes);
    if(toSendTRTC.remarks && toSendTRTC.remarks.length) {
      var remarks = JSON.stringify(toSendTRTC.remarks);
      if(remarks.length > 3 && remarks.length < 2000) {
        //console.log(remarks);
      } else if(remarks.length > 2000){
        remarks = remarks.substring(0, 1993) + '....';
      }
      runnerModel.remarks = remarks;
    }
  } else {
    runnerModel.remarks = "Error found in evaluating linked response validator code.";
  }
  return isPassed;
};

var saveReport = function(error,url,report,next,stopped){
  request({ method : 'PATCH', url : url, body : {
    statistics: {
      total : report.total,
      passed : report.passed,
      failed: report.failed,
      notExecuted: report.notExecuted
    },
    remarks : error ? (stopped ? 'Test run was stopped by user.' : util.stringify(error)) : 'All test cases executed successfully.'
  }}, function(err,response,body){
    if(error) next(error);
    else if(err || body.error) next(['Error while saving report : ', err||body]);
    else next(null, body.output.statistics, body.output.remarks);
  });
};

exports.version = '0.0.1';
exports.util = util;
exports.setOptions = function(opts){
  if(util.isObject(opts)){
    for(var ok in opts){
      options[ok] = opts[ok];
    };
  }
};

function vRunner(opts){
  var dk, error, queryObject;
  for(dk in options){
    this[dk] = options[dk];
  }
  if(util.isObject(opts)){
    for(dk in opts){
      this[dk] =  opts[dk];
    }
  }
  error = util.validateObj(this.credentials, { email : { regex : EMAIL_REGEX }, password : 'string' });
  if(error) throw new Error('vRunner : INVALID_CREDENTIALS : ' + error);
  if(typeof this.url !== 'string' || !this.url) throw new Error('vRunner : URL to fetch test cases not found.');
  queryObject = util.parseQuery(this.url);
  error = util.validateObj(queryObject, { projectId : { regex : MONGO_REGEX } });
  if(error) throw new Error('vRunner : INVALID_QUERY_STRING : ' + error);
  if(queryObject.hasOwnProperty('currentPage')) delete queryObject.currentPage;
  if(queryObject.hasOwnProperty('pageSize')) delete queryObject.pageSize;
  this.url = util.beautifyURL(V_BASE_URL,this.url,queryObject);
  this.projectId = queryObject.projectId;
  this.filters = queryObject;
  this.instanceName = getInstanceName(this.url);
  this.instanceURL = V_BASE_URL+ORG_URL_PREFIX+this.instanceName;
  this.pendingTrtc = [];
  this.stopped = false;
  this.noPassed = 0; this.noFailed =0; this.noNotExecuted = 0;
  var self = this;
  process.on( 'SIGINT', function() {
    self.emit('log',"\nPlease wait, Stopping test case execution ...");
    self.stopped = true;
  });
};

vRunner.prototype = new events.EventEmitter;

vRunner.prototype.kill = function(next){
  var self = this;
  self.sendToServer(self.instanceURL,'OVER',function(err){
    if(err) self.emit('warning',err);
    var ne = (self.totalRecords-self.noPassed-self.noFailed-self.noNotExecuted);
    self.sendToServer(self.instanceURL,ne,function(err){
      if(err) self.emit('warning',err);
      saveReport(err,self.instanceURL + '/g/testrun/'+self.testRunId,
        { total : self.totalRecords, passed : self.noPassed, failed : self.noFailed, notExecuted : ne + self.noNotExecuted },
      function(err){
        if(err) self.emit('warning',err);
        process.exit();
      }, true);
    });
  });
};

vRunner.prototype.sigIn = function(next){
  this.emit('log', 'Logging you in ...');
  request({ method: 'POST', uri: V_BASE_URL + 'user/signin', body: this.credentials }, function(err,res,body){
    if(err || body.error) next(err||body, 'VRUN_OVER');
    else next(null,body);
  });
};

vRunner.prototype.sendToServer = function(instanceURL,trtc,next){
  var self = this;
  var sendNow = function(count){
    var toSend = {};
    if(count){
      toSend.count = count;
      toSend.testRunId = self.testRunId;
      toSend.filterData = self.filters;
    } else {
      toSend.list = util.cloneObject(self.pendingTrtc);
    }
    self.pendingTrtc = [];
    request({ method: 'POST', uri: instanceURL+'/bulk/testruntestcase', body: toSend }, function(err,res,body){
      if(err || body.error) next(err||body);
      else next(null);
    });
  };
  if(trtc === 'OVER'){
    if(this.pendingTrtc.length) sendNow();
    else next(null);
  } else if(trtc === 'STOPPED'){
    sendNow();
  } else {
    this.pendingTrtc.push(trtc);
    if(this.pendingTrtc.length === TRTC_BATCH) sendNow();
    else next(null);
  }
};

vRunner.prototype.run = function(next){
  var self = this, report = { total : 0, passed : 0, failed : 0, notExecuted : 0 };
  var tasks = [
    function(cb){
      self.sigIn(cb);
    },
    function(cb){
      self.emit('log', 'Checking permission to execute test cases in project ...');
      hasRunPermission(self.instanceName,self.projectId,cb);
    },
    function(cb){
      findHelpers(self, 'authorization', function(err,auths){
        if(err) cb(err, 'VRUN_OVER');
        else {
          if(Array.isArray(auths)){
            for(var k=0;k<auths.length;k++){
              self.authorizations[auths[k].id] = getAuthHeader(auths[k]);
            }
          }
          cb();
        }
      });
    },
    function(cb){
      findHelpers(self, 'variable', function(err,vars){
        if(err) cb(err, 'VRUN_OVER');
        else {
          vars.forEach(function(vr){
            if(!self.variables.hasOwnProperty(vr.key)) self.variables[vr.key] = vr.value;
          });
          cb();
        }
      });
    },
    function(cb){
      findHelpers(self, 'responsevalidator', function(err,vals){
        if(err) cb(err, 'VRUN_OVER');
        else {
          self.validatorIdCodeMap = {};
          vals.forEach(function(model){
            var func = eval(model.code);
            try { (model.isUtil ? self.methodCodes : self.validatorIdCodeMap)[( model.isUtil ? model.name : model.id)] = eval(model.code); } catch(e){ console.log(e); };
          });
          var ZSV = new zSchemaValidator({ breakOnFirstError: false });
          var sk = jsonSchemaFiles();
          ZSV.setRemoteReference('http://json-schema.org/draft-04/schema#', sk.draft04ValidatorFile);
          var ifDraft03 = function(bv){ return (bv.$schema && bv.$schema.indexOf('draft-03') !== -1); };
          self.methodCodes.validateJSONSchema = function(av,bv){
            if(ifDraft03(bv)){
              var result = sk.draft03Validator(av,bv);
              bv.vrest_schemaErrors = result.errors || [];
              return result.valid;
            } else return ZSV.validate.call(ZSV,av,bv);
          };
          self.methodCodes.lastSchemaErrors = function(av,bv){
            if(ifDraft03(av)){ return av.vrest_schemaErrors; } else return ZSV.getLastErrors.call(ZSV,av,bv);
          };
          cb();
        }
      });
    },
    function(cb){
      self.emit('log', 'Creating test run ...');
      createTestRun(self.instanceURL,self.filters,function(err,testrun){
        if(err) cb(err, 'VRUN_OVER');
        else {
          self.testRunId = testrun.id;
          cb();
        }
      });
    },
    function(cb){
      fetchAndServe(self.url, self.pageSize, function(tc,cb0){
        var trtc = {
          result: {
            headers : [],
            statusCode : 200,
            content: '',
            resultType: 'text'
          },
          testRunId : self.testRunId,
          testCaseId : tc.id,
          executionTime: 0
        };
        var over = function(){
          report.total++;
          if(trtc.isExecuted){
            if(trtc.isPassed) {
              report.passed++;
              self.noPassed++;
              self.emit('testcase',true,tc,trtc);
            } else {
              report.failed++;
              self.noFailed++;
              self.emit('testcase',false,tc,trtc);
            }
          } else {
            report.notExecuted++;
            self.noNotExecuted++;
            self.emit('testcase',null,tc,trtc);
          }
          self.sendToServer(self.instanceURL,trtc,function(err){
            if(err) {
              //console.log('Error occurred while saving execution results : ', err);
              self.emit('warning',err);
            }
            if(self.stopped) self.kill();
            else cb0();
          });
        };
        if(tc.runnable){
          tc = util.preProcessForSearchAndReplace(tc, { startVarExpr : START_VAR_EXPR, endVarExpr : END_VAR_EXPR }, self.variables);
          if(tc.authorizationId){
            if(typeof self.authorizations[tc.authorizationId] === 'function'){
              tc.authorizationHeader = self.authorizations[tc.authorizationId](tc);
            } else tc.authorizationHeader = self.authorizations[tc.authorizationId];
          }
          tc = completeURL(tc);
          trtc.executionTime = new Date().getTime();
          fireRequest(tc,trtc,function(result){
            var isPassed = false, remarks = '', isExecuted = false;
            if(result === undefined || result === null) {
              remarks = 'An unknown error occurred while receiving response for the Test case.';
            } else if(result.err) {
              remarks = 'An error has occurred while executing this testcase. Error logged : '+JSON.stringify(result.err);
            } else if(!result.response) {
              isExecuted = true;
              remarks = 'No response received for this test case.';
            } else {
              isExecuted = true;
              var actualResults = getActualResults(result.response);
              trtc.result = actualResults;
              extractVarsFrom(tc, actualResults, self.variables);
              trtc.variable = util.cloneObject(self.variables);
              isPassed = assertResults(tc,trtc,self.variables,self.validatorIdCodeMap,self.methodCodes);
            }
            if(!trtc.remarks) trtc.remarks = remarks;
            trtc.isExecuted = isExecuted;
            trtc.isPassed = (isPassed === true)?true:false;
            over();
          });
        } else {
          trtc.remarks = 'Test case was not runnable.';
          over();
        }
      },cb, self);
    }
  ];
  util.series(tasks,function(err, data){
    if(err) self.emit('error',err);
    if(data === 'VRUN_OVER') return;
    self.sendToServer(self.instanceURL,'OVER',function(err){
      if(err) {
        self.emit('warning',err);
        //console.log('Error occurred while saving execution results : ', err);
      }
      self.emit('log', 'Saving test run execution report ...');
      saveReport(err,self.instanceURL + '/g/testrun/'+self.testRunId,report,next);
    });
  });
};

module.exports = vRunner;
