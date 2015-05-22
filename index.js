/*
 * -vrunner
 * http://vrest.io
 *
 * Copyright (c) 2015 vREST Team
 * Licensed under the MIT license.
 */

'use strict';

var request = require('request').defaults({jar: true,json:true}),
    zSchemaValidator = require('z-schema'),
    jsonSchemaFiles = require('../lib/schemaFiles'),
    util = require('../lib/util'),
    runner = require('../lib/testRunner'),
    OAuth1 = require('../lib/oauth-1_0'),
    JSONPath = require('../lib/jsonpath'),
    btoa = require('btoa'),
    V_BASE_URL = 'http://localhost:3000/',
    RUNNER_LIMIT : 5000,
    EMAIL_REGEX = /^\S+@\S+\.\S+$/,
    ORG_URL_PREFIX = 'i/',
    START_VAR_EXPR = '{{',
    END_VAR_EXPR = '{{',
    TRTC_BATCH = 5,
    MONGO_REGEX = /^[0-9a-fA-F]{24}$/,
    options = {
      credentials : {
      },
      pageSize : 100,
      methodCodes : {
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

var fetchSinglePage = function(url,page,pageSize,next,cb){
  console.log('---> Fetching '+pageSize+' testcases at page '+page+' ...');
  request(url+'&pageSize='+pageSize+'currentPage='page, function(err,res,body){
    if(err) next(['Error found at page '+page+' :', body]);
    else if(!util.isNumber(body.total) || body.total > RUNNER_LIMIT)
      next('You can not execute more than '+RUNNER_LIMIT+ 'test cases in one go.');
    else next(null, body.output, body.total !== pageSize,url,page,pageSize,next,cb);
  });
};

var afterFetch = function(err,body,last,url,page,pageSize,next,cb){
  if(err) next(err);
  else {
    util.recForEach({
      ar : body,
      ec : cb,
      finishOnError : true,
      cb : function(err){
        if(err) next(err);
        else if(last) next();
        else fetchSinglePage(url,(++page),pageSize,afterFetch,cb);
      }
    });
  }
};

var fetchAndServe = function(url, pageSize, cb, next){
  fetchSinglePage(url,0,pageSize,afterFetch,cb);
};

var hasRunPermission = function(instance,project,next){
  request(V_BASE_URL+'/user/hasPermission?permission=RUN_TEST_CASES&project='+project+'&instance='+instance, next);
};

var findHelpers = function(instanceURL,what,project,next){
  request(instanceURL+'/g/'+what+'?&projectId='+project+',
    function(err,res,body){
      if(err) next(err);
      else next(null,body.output);
  });
};

var createTestRun = function(instanceURL,filterData,next){
  request({ method: 'POST', uri: instanceURL+'/g/testrun',
    body: { name : util.getReadableDate(), projectId : true, filterData : filterData } }, function(err,res,body){
      if(err) next(['Error found while creating test run : ', body]); else next(null,body);
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

var getOAuthTwoHeader(ath){
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
    if(!result || result.err) { console.log(result); }
    trtc.executionTime = new Date().getTime() - trtc.executionTime;
    callback(result);
  });
};

var getContentType = function(responseHeaders){
  if(responseHeaders){
    //return responseHeaders['Content-Type'] || responseHeaders['content-type'];
    var i, count, name;
    for(i = 0, count = responseHeaders.length; i < count; i++){
      name = responseHeaders[i].name;
      if(name.toLowerCase() === 'content-type'){
        return responseHeaders[i].value;
      }
    }
    return responseHeaders['Content-Type'] || responseHeaders['content-type'];
  }
  return null;
};

var getResultType : function(response) {
  var rType = 'text';
  var contentType = getContentType(response.responseHeaders);
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

var parseResponseHeaders= function(response){
  var headers = {}, i, count;
  if(response && response.responseHeaders){
    var pairs = response.responseHeaders.split("\n"), str, pair;
    for(i = 0, count = pairs.length; i < count; i++){
      str = pairs[i];
      if(str){
        pair = str.split(": ");
        if(pair && pair.length === 2){
          headers[pair[0]] = pair[1];
        }
      }
    }
  }
  return headers;
};

var getActualResults = function(response) {
  return {
    statusCode : response.status,
    headers : util.mapToArray(response.responseHeaders),
    content: response.body,
    resultType: getResultType(response)
  };
};

var extractVarsFrom = function(tc, result, tcVar) {
  if(result && result.resultType){
    switch(result.resultType) {
      case 'json' :
        var self = this;
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

var assertResults = function(toSendTC,runnerModel,variables,validatorIdCodeMap){
  var isPassed = false, actualResults = runnerModel.result, headers = runnerModel.result.headers;
  var jsonSchema = (toSendTC.expectedResults && toSendTC.expectedResults.contentSchema) || '{}';
  toSendTC.expectedResults.contentSchema = util.getJsonOrString(jsonSchema);
  toSendTC.expectedResults.content =
    util.searchAndReplaceString(toSendTC.expectedResults.content, util.cloneObject(variables),
        { startVarExpr : START_VAR_EXPR, endVarExpr : END_VAR_EXPR });
  var toSendTRTC = { headers : {} };
  toSendTRTC.actualResults = actualResults;
  headers.forEach(function(a){ toSendTRTC.headers[a.name] = a.value;  });
  if(typeof validatorIdCodeMap[toSendTC.responseValidatorId] === 'function') {
    toSendTC.expectedResults.content =
      JSON.stringify(util.mergeObjects(util.getJsonOrString(toSendTC.expectedResults.content),
            util.getJsonOrString(toSendTRTC.actualResults.content),
            function(val){ return val === (START_VAR_EXPR + '*' + END_VAR_EXPR); }));
      isPassed = validatorIdCodeMap[toSendTC.responseValidatorId](toSendTC, toSendTRTC, util.methodCodes);
    if(toSendTRTC.remarks && toSendTRTC.remarks.length) {
      var remarks = JSON.stringify(toSendTRTC.remarks);
      if(remarks.length > 3 && remarks.length < 2000) { } //console.log(remarks);
      else if(remarks.length > 2000) remarks = remarks.substring(0, 1993) + '....';
      runnerModel.remarks = remarks;
    }
  } else {
    runnerModel.remarks = "Error found in evaluating linked response validator code.";
  }
  return isPassed;
};

var saveReport = function(error,url,report,next){
  request({ method : 'PATCH', url : url, body : {
    statistics: {
      total : report.total,
      passed : report.passed,
      failed: report.failed,
      notExecuted: report.notExecuted
    },
    remarks : error ? util.stringify(error) : 'All test cases executed successfully.'
  }}, function(err,response,body){
    if(error) next(error);
    else if(err) next(body);
    else next(null, body);
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
  if(!util.isURL(this.url)) throw new Error('vRunner : URL to fetch test cases not found.');
  queryObject = util.parseQuery(this.url);
  error = util.validateObj(queryObject, { projectId : { regex : MONGO_REGEX } });
  if(error) throw new Error('vRunner : INVALID_QUERY_STRING : ' + error);
  this.url = util.beautifyURL(V_BASE_URL,this.url);
  this.projectId = queryObject.projectId;
  this.filters = queryObject;
  this.instanceName = getInstanceName(this.url);
  this.instanceURL = V_BASE_URL+'/'ORG_URL_PREFIX+this.instanceName;
  this.pendingTrtc = [];
};

vRunner.prototype.sigIn = function(next){
  console.log('---> Logging you in ...');
  request({ method: 'POST', uri: V_BASE_URL + 'user/signin', body: this.credentials }, function(err,res,body){
    if(err) next(['Error found while logging you in : ', body]); else next(null,body);
  });
};

vRunner.prototype.sendToServer = function(instanceURL,trtc,next){
  this.pendingTrtc.push(trtc);
  if(this.pendingTrtc.length === TRTC_BATCH){
    var toSend = { list : util.cloneObject(this.pendingTrtc) };
    this.pendingTrtc = [];
    request({ method: 'POST', uri: instanceURL+'/bulk/testruntestcase', body: toSend }, function(err,res,body){
      if(err) next(['Error found while saving execution results : ', body]);;
      else next(null);
    });
  }
};

vRunner.prototype.run = function(next){
  var self = this, report = { total : 0, passed : 0, failed : 0, notExecuted : 0 };
  var tasks = [
    this.sigIn,
    function(cb){
      hasRunPermission(self.instanceName,self.projectId,cb);
    },
    function(cb){
      findHelpers(self.instanceURL,'authorization',self.projectId,function(err,auths){
        if(err) cb(err);
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
      findHelpers(self.instanceURL,'variable',self.projectId,function(err,vars){
        if(err) cb(err);
        else {
          vars.forEach(function(vr){
            if(!self.variables.hasOwnProperty(vr.key)) self.variables[vr.key] = vr.value;
          });
          cb();
        }
      });
    },
    function(cb){
      findHelpers(self.instanceURL,'validator',self.projectId,function(err,vals){
        if(err) cb(err);
        else {
          self.validatorIdCodeMap = {};
          vals.forEach(function(model){
            try {
              var func = eval(model.code);
              if(model.isUtil) self.methodCodes[model.name] = model.code;
              else self.validatorIdCodeMap[model.id] = model.code;
            } catch(e){
            }
          });
          var ZSV = new ZSchemaValidator({ breakOnFirstError: false });
          var sk = JSONSchemaFiles();
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
      createTestRun(self.instanceURL,self.filters,function(err,testrun){
        if(err) cb(err);
        self.testRunId = testrun.id;
      });
    },
    function(cb){
      fetchAndServe(self.url, self.pageSize, function(tc){
        var trtc = {
          result: {
            headers : [],
            statusCode : 200,
            content: '',
            resultType: 'text'
          },
          executionTime: 0
        };
        var over = function(){
          report.total++;
          if(trtc.isExecuted){
            if(trtc.isPassed) {
              console.log(tc.method +' --> '+tc.url+ ' --> PASSED');
              report.passed++;
            } else {
              console.log(tc.method +' --> '+tc.url+ ' --> FAILED');
              report.failed++;
            }
          } else {
            console.log(tc.method +' --> '+tc.url+ ' --> NOT_EXECUTED');
            report.notExecuted++;
          }
          self.sendToServer(self.instanceName,trtc,function(err){
            if(err) console.log(err);
            cb();
          });
        };
        if(tc.runnable){
          tc = util.preProcessForSearchAndReplace(tc,
            { startVarExpr : START_VAR_EXPR, endVarExpr : END_VAR_EXPR }, self.variables);
          if(tc.authorizationId){
            if(typeof self.authorizations[tc.authorizationId] === 'function'){
              tc.authorizationHeader = self.authorizations[tc.authorizationId](tc);
            } else tc.authorizationHeader = self.authorizations[tc.authorizationId];
          }
          tc = completeURL(tc);
          trtc.executionTime = new Date().getTime();
          fireRequest(tc,trtc,function(result){
            var self = this, isPassed = false, remarks = '', isExecuted = false;
            if(result === undefined || result === null) {
              remarks = 'An unknown error occurred while receiving response for the Test case.';
            } else if(result.err) {
              remarks = 'An error has occurred while executing this testcase. Error logged : '+JSON.stringify(result.err);
            } else if(!result.response) {
              isExecuted = true;
              remarks = 'No response received for this test case.';
            } else {
              isExecuted = true;
              var err = result.err, response = result.response, headers = parseResponseHeaders(response);
              response.responseHeaders = headers;
              var actualResults = this.getActualResults(response);
              trtc.result = actualResults;
              extractVarsFrom(tc, actualResults, self.variables);
              trtc.variable = util.cloneObject(self.variables);
              isPassed = assertResults(tc,trtc,self.variables,self.validatorIdCodeMap);
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
      },cb);
    }
  ];
  util.recForEach(tasks,function(err){
    saveReport(err,self.instanceURL + '/'+self.testRunId,report,next);
  });
};
