/*
 * vrunner
 * http://vrest.io
 *
 * Copyright (c) 2015 vREST Team
 * Licensed under the MIT license.
 */

'use strict';

var request = require('request').defaults({jar: true, json: true}),
    zSchemaValidator = require('z-schema'),
    events = require('events'),
    jsonSchemaFiles = require('./lib/schemaFiles'),
    util = require('./lib/util'),
    runner = require('./lib/testRunner'),
    OAuth1 = require('./lib/oauth-1_0'),
    loggers = ['console','json','xunit'],
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
    pages = [false],
    options = {
      credentials : {},
      logger : 'console',
      varColMap : {},
      exitOnDone : true,
      pageSize : 100,
      authorizations : {},
      validatorIdCodeMap : {},
      variables : {}
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

var fetchSinglePage = function(url, page, pageSize, cb, next, vrunner){
  if(page===vrunner.totalPages) next();
  else if(Array.isArray(pages[page])) {
    afterFetch(pages[page], cb, function(err){
      if(err) next(err);
      else fetchSinglePage(url, page+1, pageSize, cb, next, vrunner);
    });
    if(pages[page+1] === false) fetchSinglePage(url, page+1, pageSize, cb, next, vrunner);
  } else if(typeof pages[page] === 'string') next(pages[page]);
  else if(pages[page] === false) {
    pages[page] = true;
    request(url + '&pageSize=' + pageSize + '&currentPage=' + page, function(err, res, body){
      if(err || body.error) pages[page] = util.stringify(['Error found while fetching test cases at page '+page+' :', body]);
      else if(!util.isNumber(body.total) || body.total > RUNNER_LIMIT)
        pages[page] = 'More than '+RUNNER_LIMIT+ ' test cases can not be executed in one go.';
      else if(!page){
        oneTimeCache(vrunner,body.output,body.total);
        fetchSinglePage(url, page, pageSize, cb, next, vrunner);
        vrunner.on('new_page', function(npage){
          if(vrunner.pageLoading){
            fetchSinglePage(url,npage,pageSize,cb,next,vrunner);
            vrunner.pageLoading = false;
          }
        });
      } else {
        pages[page] = body.output;
        vrunner.emit('new_page', page);
      }
    });
  } else {
    vrunner.pageLoading = true;
    vrunner.emit('log', 'Fetching page ' + (page+1) + ' (upto ' + pageSize + ' testcases) ...');
  }
};

var afterFetch = function(body, cb, next){
  util.recForEach({ ar : body, ec : cb, finishOnError : true, cb : next });
};

var oneTimeCache = function(vrunner,records,total){
  vrunner.emit("log", "Executing test cases ... (Please wait, it may take some time.)");
  vrunner.totalRecords = total;
  vrunner.totalPages = Math.ceil(total/vrunner.pageSize);
  pages[0] = records;
  for(var z=1;z<vrunner.totalPages;z++){
    pages[z] = false;
  }
};

var fetchAndServe = function(url, pageSize, cb, next, vrunner){
  fetchSinglePage(url, 0, pageSize, cb, next, vrunner);
};

var hasRunPermission = function(instance, project, next){
  request(V_BASE_URL+'user/hasPermission?permission=RUN_TEST_CASES&project='+project+'&instance='+instance,
  function(err,res,body){
    if(err || body.error) next(['Error while checking execute permission  :', err||body], 'VRUN_OVER');
    else if(!body.output) next('Internal permission error.', 'VRUN_OVER');
    else if(body.output.permit !== true) next('NO_PERMISSION_TO_RUN_TESTCASE_IN_PROJECT', 'VRUN_OVER');
    else next(null,body.output.project);
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

var createTestRun = function(instanceURL, filterData, next){
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
    return function(tc) {
      var params = util.extractParamters(tc.params);
      new OAuth1(authConfig, tc.method, util.completeURL(tc.url, params.query)).getAuthHeader();
    };
  } else if(authType === 'oauth2.0'){
    return getOAuthTwoHeader(ath);
  }
};

var fireRequest = function(tc, trtc, callback){
  runner({ testcase : tc },function(result){
    if(!result || result.err) {
      //console.log(result);
    }
    trtc.executionTime = new Date().getTime() - trtc.executionTime;
    if(result.runnerCase) trtc.runnerCase = result.runnerCase;
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
    var opts = { startVarExpr : START_VAR_EXPR, endVarExpr : END_VAR_EXPR, prefs : [{$:$},''] };
    tc.tcVariables.forEach(function(vr){
      if(vr.name && vr.path && util.isValidPathVar({ meta : opts },vr.path)){
        if(vr.path.indexOf(opts.startVarExpr) === 0 && vr.path.indexOf(opts.endVarExpr) !== -1){
          opts.prefs[1] = result.content;
          opts.varkey = vr.name;
          util.funcVarReplace([vr.path], opts, tcVar);
        } else if(result.resultType === 'json') {
          var jsonData = util.getJsonOrString(result.content), tp;
          if(typeof(jsonData) != 'object') return;
          tcVar[vr.name] = JSONPath(jsonData, vr.path);
          if(tcVar[vr.name] === 'TC_VAR_NOT_RESOLVED') {
            tp = util.searchAndReplaceString(vr.path, tcVar, opts);
            if(tp !== vr.path) tcVar[vr.name] = JSONPath(jsonData, tp);
          }
          if(Array.isArray(tcVar[vr.name]) && tcVar[vr.name].length === 1)
            tcVar[vr.name] = tcVar[vr.name][0]; // TODO : how it was working earlier? jsonpath return array.
        }
      }
    });
  }
  return;
};

var setFinalExpContent = function(er,ar,curVars){
  var toSet = false;
  if(util.isWithVars(er.content, config.meta)){
    if(er.resultType === 'json'){
      toSet = true;
      var spcl = config.meta.startVarExpr + '*' + config.meta.endVarExpr, isSpcl = (er.content.indexOf('"'+spcl+'"') !== -1),
        exCont = util.getJsonOrString(er.content);
      if(typeof exCont === 'object'){
        util.walkInto(function(valn, key, root){
          if(typeof root === 'object' && root && root.hasOwnProperty(key)){
            var val = root[key], tmpKy = null;
            if(util.isWithVars(key, config.meta) && key !== spcl){
              tmpKy = util.searchAndReplaceString(key, curVars, config.meta);
              if(tmpKy !== key){
                val = root[tmpKy] = root[key];
                delete root[key];
              }
            }
            if(typeof val === 'string' && val && val !== spcl){
              if(util.isWithVars(val, config.meta)){
                var newValue = curVars[val.substring(config.meta.startVarExpr.length, val.length - config.meta.endVarExpr.length)];
                root[tmpKy || key] = newValue || util.searchAndReplaceString(val, curVars, config.meta);
              }
            }
          }
        }, null, exCont);
        if(isSpcl) exCont = util.mergeObjects(exCont, util.getJsonOrString(ar.content), { spcl : spcl });
        er.content = util.stringify(exCont);
      }
    } else {
      er.content = util.searchAndReplaceString(er.content, curVars, config.meta);
    }
  }
  return toSet;
};

var assertResults = function(toSendTC, runnerModel, variables, validatorIdCodeMap){
  var isPassed = false, toSendTC, actualResults = runnerModel.result,
      headers = runnerModel.result.headers, curVars = variables;
  toSendTC.expectedResults.contentSchema = util.getJsonOrString(jsonSchema);
  var toSendTRTC = { headers : {} }, jsonSchema = (tc.expectedResults && tc.expectedResults.contentSchema) || '{}';
  toSendTRTC.actualResults = actualResults;
  var toSet = setFinalExpContent(toSendTC.expectedResults, toSendTRTC.actualResults, curVars);
  headers.forEach(function(a){ toSendTRTC.headers[a.name] = a.value;  });
  if(typeof validatorIdCodeMap[tc.responseValidatorId] === 'function') {
    if(toSet) runnerModel.expectedContent = toSendTC.expectedResults.content;
    isPassed = validatorIdCodeMap[tc.responseValidatorId](toSendTC, toSendTRTC, util.methodCodes);
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

exports.version = '0.0.1';
exports.util = util;

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
  if(loggers.indexOf(this.logger) === -1)  throw new Error('vRunner : Please input a valid logger.');
  if(this.logger !== 'console' && !this.filePath) {
    this.filePath = process.env.PWD+'/vrest_logs/logs';
    if(this.logger === 'json') this.filePath += '.json';
    else if(this.logger === 'xunit') this.filePath += '.xml';
  }
  this.logger = require('./logger/'+this.logger)({ runner : this });
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

vRunner.prototype.saveReport = function(error, url, report, next, stopped){
  var self = this;
  request({ method : 'PATCH', url : url, body : {
    statistics: {
      total : report.total,
      passed : report.passed,
      failed: report.failed,
      notExecuted: report.notExecuted
    },
    remarks : error ? (stopped ? 'Test run was stopped by user.' : util.stringify(error)) : 'All test cases executed successfully.'
  }}, function(err,response,body){
    if(error) self.emit('end',error);
    else if(err || body.error) self.emit('end',['Error while saving report : ', err||body]);
    else self.emit('end',null, body.output.statistics, body.output.remarks);
  });
};

vRunner.prototype.kill = function(next){
  var self = this;
  self.sendToServer(self.instanceURL,'OVER',function(err){
    if(err) self.emit('warning',err);
    var ne = (self.totalRecords-self.noPassed-self.noFailed-self.noNotExecuted);
    self.sendToServer(self.instanceURL,ne,function(err){
      if(err) self.emit('warning',err);
      self.saveReport(err,self.instanceURL + '/g/testrun/'+self.testRunId,
        { total : self.totalRecords, passed : self.noPassed, failed : self.noFailed, notExecuted : ne + self.noNotExecuted },
      function(err){
        if(err) self.emit('warning',err);
        self.emit('log',"\nTest Run Stopped.");
        process.exit(1);
      }, true);
    });
  });
};

vRunner.prototype.sigIn = function(next){
  this.emit('log', 'Logging you in ...');
  request({ method: 'POST', uri: V_BASE_URL + 'user/signin', body: this.credentials }, function(err,res,body){
    if(err || body.error) next("Error while logging into vREST.\n" + util.stringify(err||body), 'VRUN_OVER');
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
      if(err || (body && body.error) || !body) next(err||body||'Connection could not be established to save the execution results.');
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
      hasRunPermission(self.instanceName,self.projectId,function(err,projectKey){
        if(err) cb(err);
        else {
          if(projectKey) self.projectKey = projectKey;
          cb();
        }
      });
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
      findHelpers(self, 'responsevalidator', function(err, vals){
        if(err) cb(err, 'VRUN_OVER');
        else {
          self.validatorIdCodeMap = {};
          vals.forEach(function(model){
            var func = eval(model.code);
            try {
              (model.isUtil ? util.methodCodes : self.validatorIdCodeMap)[( model.isUtil ? model.name : model.id)] = eval(model.code);
            } catch(e){
              console.log(e);
            }
          });
          var ZSV = new zSchemaValidator({ breakOnFirstError: false });
          var sk = jsonSchemaFiles();
          ZSV.setRemoteReference('http://json-schema.org/draft-04/schema#', sk.draft04ValidatorFile);
          var ifDraft03 = function(bv){ return (bv.$schema && bv.$schema.indexOf('draft-03') !== -1); };
          util.methodCodes.validateJSONSchema = function(av,bv){
            if(ifDraft03(bv)){
              var result = sk.draft03Validator(av,bv);
              bv.vrest_schemaErrors = result.errors || [];
              return result.valid;
            } else return ZSV.validate.call(ZSV,av,bv);
          };
          util.methodCodes.lastSchemaErrors = function(av,bv){
            if(ifDraft03(av)){ return av.vrest_schemaErrors; } else return ZSV.getLastErrors.call(ZSV,av,bv);
          };
          cb();
        }
      });
    },
    function(cb){
      findHelpers(self, 'variable', function(err,vars){
        if(err) cb(err, 'VRUN_OVER');
        else {
          self.variables = util.configureVarCol(vars, { startVarExpr : START_VAR_EXPR, endVarExpr : END_VAR_EXPR });
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
            if(self.stopped){
              self.kill();
            }
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
      self.saveReport(err,self.instanceURL + '/g/testrun/'+self.testRunId,report,next);
    });
  });
};

module.exports = vRunner;
