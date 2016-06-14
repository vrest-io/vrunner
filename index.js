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
    ReplaceModule = require('./lib/replacingStrings'),
    OAuth1 = require('./lib/oauth-1_0'),
    loggers = ['console','json','xunit'],
    JSONPath = require('./lib/jsonpath'),
    btoa = require('btoa'),
    V_BASE_URL = 'https://vrest.io/',
    publicConfiguration = {},
    RUNNER_LIMIT = 5000,
    EMAIL_REGEX = /^\S+@\S+\.\S+$/,
    ORG_URL_PREFIX = 'i/',
    START_VAR_EXPR = '{{',
    END_VAR_EXPR = '}}',
    TRTC_BATCH = 5,
    MONGO_REGEX = /^[0-9a-fA-F]{24}$/,
    tcFetched = 0,
    pages = [false],
    options = {
      credentials : {},
      logger : 'console',
      varColMap : {},
      projEnv : undefined,
      exitOnDone : true,
      pageSize : 100,
      authorizations : {},
      validatorIdCodeMap : {},
      variables : {}
    },
    config = {
      meta : publicConfiguration
    };

    var replacingString = ReplaceModule.replace;

    /*
     * replacing all the entities of test cases that need to be handled with variables
     *
     * @param {Object} tc - the test case
     *
     * @return {Object} tc - the modified test case, with all the variables replaced with corresponding values
     * */
    var processUtil = {
      preProcessForSearchAndReplace: function(tc) {

        var key, variables = ReplaceModule.getVars();

        if(tc.params){
          tc.params.forEach(function(v){
            if(v.id){
              v.value = replacingString(v.value || '');
              if(v.method === 'path') {
                //path variables will overwrite previously defined variables
                variables[util.getModelVal(v, 'name')] = util.getModelVal(v, 'value');
              }
            }
          });
        }

        return this.preProcessTestCase(tc);
      },

      searchAndReplaceString : function(str){
        return replacingString(str);
      },

      configureVarCol : function(varCol){
        //varCol: global variable collection
        ReplaceModule.clearVars();
        var variables = ReplaceModule.getVars(), key, vlu, tmp, typ;
        for(var z=0, v = null, len = varCol.length;z<len;z++){
          v = varCol[z];
          if(v.id){
            key = util.getModelVal(v, 'key');
            vlu = replacingString(util.getModelVal(v,'value'));
            typ = util.getModelVal(v,'varType');
            if(typ !== 'string'){
              try {
                tmp = JSON.parse(vlu);
              } catch(e){
              }
            }
            if(typ === typeof tmp) {
              vlu = tmp;
            }
            variables[key] = vlu;
          }
        }
        return variables;
      },

      tsParse : function(output, orderTestCases, mainIdField){
        var cnt = output.length, ent;
        for(var j= 0;j < cnt;j++){
          delete output[j].testSuites;
          delete output[j].sortNumber;
          if(orderTestCases){
            ent = orderTestCases[output[j].id];
            if(Array.isArray(ent)){
              ent.forEach(function(en,ind){
                if(!ind){
                  output[j].sortNumber = en.index;
                  output[j].runnable = en.runnable;
                  output[j][mainIdField] = output[j].id;
                  output[j].id = en.entryId;
                } else {
                  var nw = util.cloneObject(output[j]);
                  nw.id = en.entryId;
                  nw.runnable = en.runnable;
                  nw.sortNumber = en.index;
                  output.push(nw);
                }
              });
            }
          } else {
            output[j].sortNumber = output[j].uniqueId;
          }
        }
        return output;
      },

      preProcessTestCase : function(tc) {
        tc.url = replacingString(tc.url);

        if(tc.headers){
          tc.headers.forEach(function(header){
            if(header.id){
              header.value = replacingString(header.value || '');
            }
          });
        }

        // below line is already in assert. So no need here.
        // if(tc.expectedResults) tc.expectedResults.content = replacingString(tc.expectedResults.content);
        if(tc.raw && tc.raw.enabled && tc.raw.content) tc.raw.content = replacingString(tc.raw.content);
        if(tc.condition) {
          try {
            tc.condition = JSON.parse(replacingString(tc.condition));
          } catch(er){
            tc.condition = true;
          }
        } else {
          tc.condition = true;
        }
        return tc;
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

var completePage = function(url, page, pageSize, cb, next, vrunner){
  if(tcFetched === 0 || (tcFetched % pageSize !== 0)){
    if(vrunner.allTS[(vrunner.tsi+1)]){
      vrunner.tsi++;
      fetchSinglePage(url, 0, pageSize, cb, next, vrunner, page);
    }
  }
};

var fetchSinglePage = function(url, page, pageSize, cb, next, vrunner, addToPage){
  var forPage = (typeof addToPage === 'number' ? addToPage : page);
  if(typeof addToPage === 'number' && (!(vrunner.totalPages) || (page >= vrunner.totalPages))) return true;
  if(forPage === vrunner.totalPages) next();
  else if(Array.isArray(pages[forPage]) && (pages[forPage].length === pageSize || (vrunner.tsi === (vrunner.allTS.length)))) {
    afterFetch(pages[forPage], cb, function(err){
      if(err) next(err);
      else fetchSinglePage(url, page+1, pageSize, cb, next, vrunner);
    });
    if(pages[forPage+1] === false) fetchSinglePage(url, forPage+1, pageSize, cb, next, vrunner);
  } else if(typeof pages[forPage] === 'string') next(pages[forPage]);
  else if(pages[forPage] === false || (typeof addToPage === 'number')) {
    if(typeof addToPage !== 'number') pages[forPage] = true;
    request(url+'&testSuiteIds[]='+vrunner.allTS[vrunner.tsi]+'&pageSize='+pageSize+'&currentPage='+page, function(err, res, body){
      if(err || body.error) {
        pages[forPage] = util.stringify(['Error found while fetching test cases at page '+page+' :', body]);
      } else {
        if(!page && !vrunner.tsi){
          vrunner.emit("log", "Executing test cases ... (Please wait, it may take some time.)");
          vrunner.on('new_page', function(npage){
            if(vrunner.pageLoading){
              fetchSinglePage(url,npage,pageSize,cb,next,vrunner);
              vrunner.pageLoading = false;
            }
          });
        }
        var res = (processUtil.tsParse(body.output, body.orderTestCases, 'originalId')).sort(function(a,b){
          return a.sortNumber - b.sortNumber;
        });
        if(pages[forPage] === true){
          pages[forPage] = [];
        }
        if((pages[forPage].length + res.length) <= pageSize){
          pages[forPage] = pages[forPage].concat(res);
          tcFetched += res.length;
        } else {
          var lef = (pageSize - pages[forPage].length);
          pages[forPage] = pages[forPage].concat(res.slice(0,lef));
          pages[forPage+1] = res.slice(lef);
          tcFetched += res.length;
        }
        if(tcFetched === vrunner.totalRecords){
          vrunner.tsi++;
          fetchSinglePage(url,page,pageSize,cb,next,vrunner);
        } else {
          completePage(url, forPage, pageSize, cb, next, vrunner);
        }
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

var oneTimeCache = function(vrunner,records){
  vrunner.emit("log", "Executing test cases ... (Please wait, it may take some time.)");
  pages[0] = records;
};

var fetchAndServe = function(url, pageSize, cb, next, vrunner){
  fetchSinglePage(url, 0, pageSize, cb, next, vrunner);
};

var hasRunPermission = function(instance, project, next){
  request(V_BASE_URL+'user/hasPermission?prefetchRunnerData=true&permission=RUN_TEST_CASES&project='+project+'&instance='+instance,
  function(err,res,body){
    if(err || body.error) next(['Error while checking execute permission  :', err||body], 'VRUN_OVER');
    else if(!body.output) next('Internal permission error.', 'VRUN_OVER');
    else if(body.output.permit !== true) next('NO_PERMISSION_TO_RUN_TESTCASE_IN_PROJECT', 'VRUN_OVER');
    else next(null,body.output.project, body.output.prefetch);
  });
};

var findHelpers = function(prefetch, vrunner, what, next){
  vrunner.emit('log', 'Finding '+what+'s ...');
  if(what === 'publicConfiguration'){
    if(typeof prefetch[what] !== 'object') prefetch[what] = {};
  } else {
    if(!Array.isArray(prefetch[what])) prefetch[what] = [];
  }
  next(null,prefetch[what]);
};

var createTestRun = function(instanceURL, filterData, next){
  request({ method: 'POST', uri: instanceURL+'/g/testrun',
    body: { name : util.getReadableDate(), projectId : true, filterData : filterData } }, function(err,res,body){
      if(err || body.error) next(['Error while creating test run : ',err||body]);
      else next(null,body.output,body.total);
  });
};

var getBasicAuthHeader = function(ath){
  var authConfig = ath.authConfig || '', token = authConfig.username + ':' + authConfig.password;
  return 'Basic ' + btoa(token);
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
    var afterWait = function(){
      if(!result || result.err) {
        //console.log(result);
      }
      if(result.runnerCase) trtc.runnerCase = result.runnerCase;
      callback(result);
    };
    trtc.executionTime = new Date().getTime() - trtc.executionTime;
    if(tc.waitFor) setTimeout(afterWait, tc.waitFor*1000);
    else afterWait();
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

var getJSONPathValue = function(path, json){
  var ret = undefined, tp;
  if(typeof(json) != 'object') return ret;
  ret = JSONPath(json, path);

  if(ret === 'V_PATH_NOT_RESOLVED') {
    tp = processUtil.searchAndReplaceString(path);
    if(tp !== path) ret = JSONPath(json, tp);
  }
  if(Array.isArray(ret) && ret.length === 1) return ret[0];
  else return ret;
};

var getActualResults = function(response) {
  return {
    statusCode : response.statusCode,
    headers : util.mapToArray(response.headers),
    content: util.stringify(response.body, null, true),
    resultType: getResultType(response)
  };
};

var getJsonPath = function(path){
  if(typeof path === 'string' && path.length) {
    return '$'+(path.charAt(0) === '[' ? '' : '.') + path;
  }
};

var isAssertionForValidator = function(ass){
  return ass.name === 'textBody' && MONGO_REGEX.test(ass.type);
};

var assert = function(validatorIdCodeMap, ass, ops){
  var ret = { passed : false }, forValidator = ops.forValidator;
  if(forValidator){
    ret.assertion = { name : 'textBody', type : ass.type };
    if(typeof validatorIdCodeMap[ass.type] === 'function') {
      try {
        ret.passed = validatorIdCodeMap[ass.type].apply(undefined, forValidator);
      } catch(e){
        ret.passed = false;
        ret.remarks = 'An error found while validating with response validator : ' + e.message;
        console.log(e.stack);
      }

      if(forValidator[1].remarks && forValidator[1].remarks.length) {
        var remarks = util.cropString(JSON.stringify(forValidator[1].remarks), 1995);
        ret.remarks = remarks;
        delete forValidator[1].remarks;
      }
    } else {
      ret.result = "Error found in evaluating linked response validator code.";
    }
  } else {
    if(typeof util.v_asserts._[ass.type] === 'function'){
      ret.passed = util.v_asserts._[ass.type](ops.ac==='V_PATH_NOT_RESOLVED'?undefined:ops.ac,ops.ex);
      ret.assertion = { name : ass.name, type : ass.type };
      ret.assertion.property = ass.property || '';
      ret.assertion.value = ass.value || '';
      ret.assertion.actual = ops.setActual || ops.ac;
    }
  }
  return ret;
};


var extractVarsFrom = function(tc, result, headers) {
  if(result && result.resultType){
    var opts = { prefixes : ['',{}] }, jsonData = util.getJsonOrString(result.content), tp;
    var variables = ReplaceModule.getVars();
    tc.tcVariables.forEach(function(vr){
      if(vr.name && vr.path){
        if(vr.path.indexOf(config.meta.startVarExpr) === 0 && vr.path.indexOf(config.meta.endVarExpr) !== -1){
          opts.prefixes[0] = result.content;
          opts.prefixes[1].headers = headers;
          variables[vr.name] = ReplaceModule.replace(vr.path,opts);
        } else if(result.resultType === 'json') {
          variables[vr.name] = getJSONPathValue(getJsonPath(vr.path), jsonData);
        }
      }
    });
  }
  return;
};

var findExAndAc = function(curVars, headersMap, ass, actualResults, actualJSONContent, executionTime){
  if(util.v_asserts.shouldAddProperty(ass.name)) {
    ass.property = processUtil.searchAndReplaceString(ass.property, curVars, publicConfiguration);
  } else delete ass.property;
  if(!util.v_asserts.shouldNotAddValue(ass.name, ass.type, config)) {
    ass.value = processUtil.searchAndReplaceString(ass.value, curVars, publicConfiguration);
  } else delete ass.value;
  switch(ass.name){
    case 'statusCode' :
      return { ac : actualResults.statusCode, ex : ass.value };
    case 'responseTime' :
      return { ac : executionTime, ex : ass.value };
    case 'header' :
      if(!ass.property) return {};
      return { ac : headersMap[ass.property.toLowerCase()], ex : ass.value };
    case 'textBody' :
      return { ac : actualResults.content, setActual : publicConfiguration.copyFromActual, ex : ass.value };
    case 'jsonBody' :
      return {
        ac : getJSONPathValue(getJsonPath(ass.property), actualJSONContent), ex : ass.value,
        setActual : (typeof actualJSONContent === 'object') ? (publicConfiguration.copyFromActual+'json') : false
      };
    case 'default' :
      return {};
  }
};

var initForValidator = function(headersMap, runnerModel, applyToValidator, tc){ //tc added
  if(applyToValidator.length) return;
  var actualResults = runnerModel.result, curVars = runnerModel.variable,
    toSendTC = (typeof tc.toJSON == 'function') ? tc.toJSON() : tc, toSendTRTC = { headers : headersMap },
    jsonSchema = (tc.expectedResults && tc.expectedResults.contentSchema) || '{}';
  toSendTC.expectedResults.contentSchema = util.getJsonOrString(jsonSchema);
  toSendTRTC.actualResults = actualResults;
  var toSet = setFinalExpContent(toSendTC.expectedResults, toSendTRTC.actualResults, curVars);
  applyToValidator.push(toSendTC, toSendTRTC, ReplaceModule.getFuncs());
  if(toSet) runnerModel.expectedContent = toSendTC.expectedResults.content;
};


var setFinalExpContent = function(er,ar,curVars){
  var toSet = false;
  if(util.isWithVars(er.content)){
    var spcl = START_VAR_EXPR + '*' + END_VAR_EXPR, spclFl = '"'+spcl+'"';
    toSet = true;
    if(er.content === spclFl) {
      er.content = ar.content;
    } else if(er.resultType === 'json'){
      var spclIn = er.content.indexOf(spclFl), isSpcl = (spclIn !== -1), exCont = util.getJsonOrString(er.content);
      if(typeof exCont === 'object'){
        util.walkInto(function(valn, key, root){
          if(typeof root === 'object' && root && root.hasOwnProperty(key)){
            var val = root[key], tmpKy = null;
            if(util.isWithVars(key) && key !== spcl){
              tmpKy = processUtil.searchAndReplaceString(key, curVars, config.meta);
              if(tmpKy !== key){
                val = root[tmpKy] = root[key];
                delete root[key];
              }
            }
            if(typeof val === 'string' && val && val !== spcl){
              if(util.isWithVars(val)){
                root[tmpKy || key] = processUtil.searchAndReplaceString(val);
              }
            }
          }
        }, null, exCont);
        if(isSpcl) exCont = util.mergeObjects(exCont, util.getJsonOrString(ar.content), { spcl : spcl });
        er.content = util.stringify(exCont);
      }
    } else {
      er.content = processUtil.searchAndReplaceString(er.content);
    }
  }
  return toSet;
};

var setAssertionUtil = function(meta){
  var typeOpts = util.v_asserts.assertTypeOpts,
    unCamelCase = util.unCamelCase.bind(util),
    funcMap = util.v_asserts._,
    valMap = {}, mainTests = meta.assertTypes.textBody.tests, len = mainTests.length,
    subTypeOpts = util.v_asserts.assertSubTypeOpts;
  for(var z=len-1;z>=0;z--){
    if(meta.mongoIdRegex.test(mainTests[z])){
      mainTests.pop();
    }
  }
  meta.prefetch.responsevalidator.forEach(function(rs){
    if(!rs.isUtil) {
      valMap[rs.id] = 'Call '+rs.name;
      mainTests.push(rs.id);
    }
  });
  for(var ky in meta.assertTests){
    try {
      funcMap[ky] = eval('(function(a,b){ return '+meta.assertTests[ky]+';})');
    } catch(el){
    }
  }
  for(ky in meta.assertTypes){
    subTypeOpts[ky] = [];
    typeOpts.push([meta.assertTypes[ky].name, ky]);
    meta.assertTypes[ky].tests.forEach(function(ts){
      if(meta.mongoIdRegex.test(ts)){
        subTypeOpts[ky].push([valMap[ts], ts]);
      } else {
        subTypeOpts[ky].push([unCamelCase(ts), ts]);
      }
    });
  }
};

var assertResults = function(runnerModel, tc, validatorIdCodeMap){
  if(!tc) tc = {};
  var isPassed = true, toValidate = false, headers = {},
    actualResults = runnerModel.result, isValAss = isAssertionForValidator;
  actualResults.headers.forEach(function(hd){ if(hd.name) headers[hd.name.toLowerCase()] = hd.value; });
  var actualJSONContent = util.getJsonOrString(actualResults.content),
      findEx = findExAndAc.bind(undefined, runnerModel.variable, headers),
    applyToValidator = [], initForVal = initForValidator.bind(undefined, headers),
    ret = [], asserting = assert.bind(undefined, validatorIdCodeMap);
  tc.assertions.forEach(function(ass){
    if(ass.id){
      var now = false;
      if(isValAss(ass)) {
        initForVal(runnerModel, applyToValidator, tc);
        now = asserting(ass, { forValidator : applyToValidator });
      } else {
        now = asserting(ass, findEx(ass, actualResults, actualJSONContent, runnerModel.executionTime));
      }
      if(now){
        ret.push(now);
        isPassed = isPassed && now.passed;
      }
    }
  });
  runnerModel.assertionRemarks = ret;
  return isPassed;
};

exports.version = require('./package.json').version;
exports.util = util;

function vRunner(opts){
  console.log('INFO => vRUNNER version : '+exports.version);
  if(opts.vRESTBaseUrl){
    V_BASE_URL = opts.vRESTBaseUrl;
    delete opts.vRESTBaseUrl;
  }
  if(opts.nosslcheck === true){
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    delete opts.nosslcheck;
  }
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
  this.allTS = queryObject['testSuiteIds[]'];
  if(!Array.isArray(this.allTS) && MONGO_REGEX.test(this.allTS)) this.allTS = [this.allTS];
  if(!Array.isArray(this.allTS) || !this.allTS.length){
    throw new Error('vRUNNER : At least one test suite must be provided for test run.');
  }
  this.tsi = 0;
  this.indTS = {};
  this.prevTS = null;
  if(error) throw new Error('vRunner : INVALID_QUERY_STRING : ' + error);
  if(queryObject.hasOwnProperty('currentPage')) delete queryObject.currentPage;
  if(queryObject.hasOwnProperty('pageSize')) delete queryObject.pageSize;
  this.projectId = queryObject.projectId;
  this.filters = queryObject;
  this.instanceName = getInstanceName(this.url);
  this.instanceURL = V_BASE_URL+ORG_URL_PREFIX+this.instanceName;
  this.url = this.instanceURL + '/g/testcase?projectId='+this.projectId;
  this.pendingTrtc = [];
  this.stopped = false;
  this.noPassed = 0; this.noFailed =0; this.noNotExecuted = 0; this.notRunnable = 0;
  var self = this;
  process.on( 'SIGINT', function() {
    self.emit('log',"\nPlease wait, Stopping test case execution ...");
    self.stopped = true;
  });
};

vRunner.prototype = new events.EventEmitter;

var getRemarks = function(total, passed, failed, notExecuted, notRunnable){
  var rem = '';
  if(total){
    if(notExecuted === total) rem = 'All of the test cases are not executed.';
    else if(notRunnable === total) rem = 'No Test Cases executed as all the test cases are marked as Not Runnable.';
    else if(passed === total) rem = 'All of the test cases are passed.';
    else if(failed === total) rem = 'All of the test cases are failed.';
    else {
      if(passed) rem = (passed+' passed');
      if(failed) rem += ((rem ? ', ' : '') + (failed+' failed'));
      if(notExecuted) rem += ((rem ? ', ' : '') + (notExecuted+' not executed'));
      if(notRunnable) rem += ((rem ? ', ' : '') + (notRunnable+' not runnable'));
      rem += '.';
    }
  } else rem = 'No test case found to be executed.';
  return rem;
};

vRunner.prototype.initAll = function(total){
  this.exTS = {};
  this.totalRecords = total;
  this.totalPages = Math.ceil(total/this.pageSize);
  for(var z=0;z<this.totalPages;z++){
    pages[z] = false;
  }
  var filters = util.cloneObject(this.filters);
  filters.currentPage = 0;
  filters.pageSize = 100;
  filters.testSuiteIds = filters['testSuiteIds[]'];
  delete filters['testSuiteIds[]'];
  if(!Array.isArray(filters.testSuiteIds) && MONGO_REGEX.test(filters.testSuiteIds)){
    filters.testSuiteIds = [filters.testSuiteIds];
  }
  this.filterDataToSend = filters;
};

vRunner.prototype.saveReport = function(error, url, report, next, stopped){
  var self = this;
  request({ method : 'PATCH', url : url, body : {
    statistics: {
      total : report.total,
      passed : report.passed,
      failed: report.failed,
      notExecuted: report.notExecuted,
      notRunnable: report.notRunnable
    }, remarks : error ? (stopped ? 'Test run was stopped by user.' : util.cropString(util.stringify(error), RUNNER_LIMIT))
                : getRemarks(report.total, report.passed, report.failed, report.notExecuted, report.notRunnable)
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
    var ne = (self.totalRecords-self.noPassed-self.noFailed-self.noNotExecuted-self.notRunnable);
    self.sendToServer(self.instanceURL,ne,function(err){
      if(err) self.emit('warning',err);
      self.saveReport(err,self.instanceURL + '/g/testrun/'+self.testRunId, {
        total : self.totalRecords, passed : self.noPassed, notRunnable : self.notRunnable,
        failed : self.noFailed, notExecuted : ne + self.noNotExecuted
      }, function(err){
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
      toSend.filterData = self.filterDataToSend;
    } else {
      toSend.list = self.pendingTrtc;
    }
    self.pendingTrtc = [];
    request({ method: 'POST', uri: instanceURL+'/bulk/testruntestcase', body: toSend }, function(err,res,body){
      if(err || (body && body.error) || !body) {
        self.emit('warning',util.stringify(err||body||'Connection could not be established to save the execution results.',true,true));
      }
    });
    next(null);
  };
  if(trtc === 'OVER'){
    if(this.pendingTrtc.length) sendNow();
    else next(null);
  } else if(typeof trtc === 'number'){
    sendNow(trtc);
  } else {
    this.pendingTrtc.push(trtc);
    if(this.pendingTrtc.length === TRTC_BATCH) sendNow();
    else next(null);
  }
};

vRunner.prototype.run = function(next){
  var self = this, report = { total : 0, passed : 0, failed : 0, notExecuted : 0, notRunnable : 0 };
  var tasks = [
    function(cb){
      self.sigIn(cb);
    },
    function(cb){
      self.emit('log', 'Checking permission to execute test cases in project ...');
      hasRunPermission(self.instanceName,self.projectId,function(err,projectKey, prefetch){
        if(err) cb(err);
        else {
          if(projectKey) self.projectKey = projectKey;
          findHelpers = findHelpers.bind(undefined,prefetch || {});
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
      findHelpers(self, 'publicConfiguration', function(err,body){
        if(err || body.error) cb(['Error while fetching '+what+'s :', err||body], 'VRUN_OVER');
        else {
          config.meta = publicConfiguration = body;
          publicConfiguration.startVarExpr = START_VAR_EXPR;
          publicConfiguration.endVarExpr = END_VAR_EXPR;
          publicConfiguration.mongoIdRegex = MONGO_REGEX;
          cb();
        }
      });
    },
    function(cb){
      findHelpers(self, 'responsevalidator', function(err, vals){
        if(err) cb(err, 'VRUN_OVER');
        else {
          self.validatorIdCodeMap = {};
          var funcVars = ReplaceModule.getFuncs();
          vals.forEach(function(model){
            try {
              (model.isUtil ? funcVars : self.validatorIdCodeMap)[( model.isUtil ? model.name : model.id)] = eval(model.code);
            } catch(e){
              console.log(e);
            }
          });
          if(!publicConfiguration.prefetch) publicConfiguration.prefetch = {};
          publicConfiguration.prefetch.responsevalidator = vals;
          setAssertionUtil(publicConfiguration);
          var ZSV = new zSchemaValidator({ breakOnFirstError: false });
          var sk = jsonSchemaFiles();
          ZSV.setRemoteReference('http://json-schema.org/draft-04/schema#', sk.draft04ValidatorFile);
          var ifDraft03 = function(bv){ return (bv.$schema && bv.$schema.indexOf('draft-03') !== -1); };
          funcVars.validateJSONSchema = function(av,bv){
            if(ifDraft03(bv)){
              var result = sk.draft03Validator(av,bv);
              bv.vrest_schemaErrors = result.errors || [];
              return result.valid;
            } else return ZSV.validate.call(ZSV,av,bv);
          };
          funcVars.lastSchemaErrors = function(av,bv){
            if(ifDraft03(av)){ return av.vrest_schemaErrors; } else return ZSV.getLastErrors.call(ZSV,av,bv);
          };
          cb();
        }
      });
    },
    function(cb){
      findHelpers(self, 'projenv', function(err,envs){
        if(err) cb(err, 'VRUN_OVER');
        else {
          self.selectedEnvironment = false;
          for(var z=0,len=envs.length;z<len;z++){
            if(self.projEnv === envs[z].name){
              self.selectedEnvironment = envs[z].id;
              break;
            }
          }
          if(!self.selectedEnvironment){
            if(self.projEnv && self.projEnv !== 'Default'){
              self.emit('error', 'Project environment "' + self.projEnv + '" not found.');
              process.exit(1);
            } else {
              self.selectedEnvironment = undefined;
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
          self.variables = processUtil.configureVarCol(vars, {
            selectedEnvironment : self.selectedEnvironment, startVarExpr : START_VAR_EXPR, endVarExpr : END_VAR_EXPR });
          cb();
        }
      });
    },
    function(cb){
      self.emit('log', 'Creating test run ...');
      var filters = util.cloneObject(self.filters);
      filters.pageSize = 100;
      filters.testSuiteIds = filters['testSuiteIds[]'];
      delete filters['testSuiteIds[]'];
      if(!Array.isArray(filters.testSuiteIds) && MONGO_REGEX.test(filters.testSuiteIds)){
        filters.testSuiteIds = [filters.testSuiteIds];
      }
      self.filterDataToSend = filters;
      createTestRun(self.instanceURL,self.filterDataToSend,function(err,testrun,total){
        if(err) cb(err, 'VRUN_OVER');
        else {
          console.log('INFO => Test run name : '+testrun.name);
          self.initAll(total);
          self.testRunName = testrun.name;
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
          isExecuted: false,
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
            if(tc.runnable){
              report.notExecuted++;
              self.noNotExecuted++;
            } else {
              report.notRunnable++;
              self.notRunnable++;
            }
            self.emit('testcase',null,tc,trtc);
          }
          trtc.remarks = util.cropString(trtc.remarks, RUNNER_LIMIT);
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
          tc = processUtil.preProcessForSearchAndReplace(tc, { startVarExpr : START_VAR_EXPR, endVarExpr : END_VAR_EXPR }, self.variables);
          if(tc.condition) {
            tc.url = util.completeURL(tc.url, tc.params);
            if(tc.authorizationId){
              if(typeof self.authorizations[tc.authorizationId] === 'function'){
                tc.authorizationHeader = self.authorizations[tc.authorizationId](tc);
              } else tc.authorizationHeader = self.authorizations[tc.authorizationId];
            }
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
                extractVarsFrom(tc, actualResults, result.response.headers);
                trtc.variable = util.cloneObject(self.variables);
                isPassed = assertResults(trtc,tc, self.validatorIdCodeMap);
              }
              if(!trtc.remarks) trtc.remarks = remarks;
              trtc.isExecuted = isExecuted;
              trtc.isPassed = (isPassed === true)?true:false;
              over();
            });
          } else {
            tc.runnable = false;
            trtc.result.content = JSON.stringify(tc.condition);
            trtc.remarks = 'Test case condition was failed, so was not runnable.';
            over();
          }
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
