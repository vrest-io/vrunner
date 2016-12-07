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
    loggers = ['console','json','xunit','csv'],
    JSONPath = require('./lib/jsonpath'),
    pathUtil = require('path'),
    btoa = require('btoa'),
    mainUrlUtil = require('url'),
    V_BASE_URL = 'https://vrest.io/',
    publicConfiguration = {},
    RUNNER_LIMIT = 5000,
    EMAIL_REGEX = /^\S+@\S+\.\S+$/,
    ORG_URL_PREFIX = 'i/',
    START_VAR_EXPR = '{{',
    END_VAR_EXPR = '}}',
    TRTC_BATCH = 5,
    MONGO_REGEX = /^[0-9a-fA-F]{24}$/,
    pages = [false],
    MAIN_AUTHORIZATIONS = {},
    MAIN_COLLECTION = [],
    _ = {
      extend : function(target) {
        if (target == null) { target = {}; }
        target = Object(target);
        for (var index = 1; index < arguments.length; index++) {
          var source = arguments[index];
          if (source != null) {
            for (var key in source) {
              if (Object.prototype.hasOwnProperty.call(source, key)) {
                target[key] = source[key];
              }
            }
          }
        }
        return target;
      }
    },
    LOOPS = [],
    options = {
      credentials : {},
      logger : 'console',
      varColMap : {},
      projEnv : undefined,
      exitOnDone : true,
      pageSize : 100,
      authorizations : {},
      validatorIdCodeMap : {}
    },
    config = {
      meta : publicConfiguration
    };

    var replacingString = ReplaceModule.replace, VARS = ReplaceModule.getVars();
    VARS.$ = 0;

    var findTcVarsName = function(what,which){
      var ar = what.tcVariables || [];
      if(Array.isArray(ar)){
        var ln = ar.length;
        for(var z =0 ; z< ln; z++){
          if(ar[z] && ar[z].type === which){
            return ar[z].name;
          }
        }
      }
    }, setLoopStatus = function(vrs,fl,lp,vl,exStatusAll){
      if(!(Array.isArray(vrs[fl]))) vrs[fl] = [];
      var ar = vrs[fl];
      if(ar[lp] === undefined){
        while(ar.length <= lp){ ar.push(undefined); }
      }
      ar[lp] = vl;
      if(exStatusAll){
        var ls = { isRunnable : false, isExecuted : false, isPassed : true }, ln = ar.length;
        if(ln) { ls.isRunnable = true; ls.isExecuted = true; }
        for(var z = 0; z < ln; z++){
          ['isPassed','isExecuted','isRunnable'].forEach(function(frm){
            ls[frm] = ls[frm] && (ar[z][frm]);
          });
        }
        return ls;
      }
    }, setStatusVar = function(vrs,exStatusAll,lpfl,vl){
      var ls = { isRunnable : false, isExecuted : false, isPassed : false };
      if(typeof vl === 'number'){
        if(vl > 0){
          ls.isExecuted = ls.isRunnable = true;
          ls.isPassed = (vl === 2);
        } else if(vl === 0){
          ls.isRunnable = true;
        }
        if(lpfl){
          ls = setLoopStatus(vrs, lpfl, VARS.$, ls, exStatusAll);
        }
        if(exStatusAll && ls){
          vrs[exStatusAll] = ls;
        }
      }
    };

    /*
     * replacing all the entities of test cases that need to be handled with variables
     *
     * @param {Object} tc - the test case
     *
     * @return {Object} tc - the modified test case, with all the variables replaced with corresponding values
     * */
    var processUtil = {
      extractPathVars: function(params) {
        if(Array.isArray(params)){
          params.forEach(function(v){
            var ky = util.getModelVal(v, 'name');
            if(v.id && ky && v.method === 'path') {
              //path variables will overwrite previously defined variables
              VARS[replacingString(ky)] = replacingString(util.getModelVal(v, 'value') || '');
            }
          });
        }
      },

      getJsonOrString: function(str){
        if(typeof str === 'string'){
          try {
            return JSON.parse(str);
          } catch(err){
            return str;
          }
        }
        return str;
      },

      getReadableString : function(st,blank){
        if(blank && (st === undefined || st === null)) return '';
        if(typeof st === 'string') return st;
        if(typeof st === 'object') return JSON.stringify(st);
        return String(st);
      },

      getReplacedStringifiedObject : function(obj,opt){
        if(typeof opt !== 'object' || !opt){ opt = {}; }
        if(!opt.spcl){ opt.spcl = config.meta.startVarExpr + '*' + config.meta.endVarExpr; }
        var spcl = opt.spcl;
        if(obj){
          if(!opt.dontParse){ obj = processUtil.getJsonOrString(obj); }
          if(typeof obj === 'object'){
            util.walkInto(function(valn, key, root){
              if(typeof root === 'object' && root && root.hasOwnProperty(key)){
                var val = root[key], tmpKy = null;
                if(util.isWithVars(key) && key !== spcl){
                  tmpKy = processUtil.replacingString(key);
                  if(tmpKy !== key){
                    val = root[tmpKy] = root[key];
                    delete root[key];
                  }
                }
                if(typeof val === 'string' && val && val !== spcl){
                  if(util.isWithVars(val)){
                    root[tmpKy || key] = processUtil.replacingString(val);
                  }
                }
              }
            }, null, obj);
          }
        }
        if(typeof obj !== 'object'){
          obj = processUtil.replacingString(String(obj));
        }
        return (typeof obj !== 'string' && opt.castInString) ? util.stringify(obj) : obj;
      },

      completeURL: function(url, params) {
        var s = '', i = 0,l, pm;
        if(!params || typeof params !== 'object') return url;
        var make = function(vl, i){
          s += (((s)?'&':'?')) + i + '=' + (typeof (vl) === 'object' ? util.stringify(vl) : (vl || ''));
        };
        if(Array.isArray(params)){
          for(i=0,l=params.length;i<l;i++){
            pm = params[i];
            if(pm.toJSON) pm = pm.toJSON();
            if(pm.method == 'query' && pm.name && pm.name.length) {
              make(pm.value, pm.name);
            }
          }
        } else {
          for(i in params){
            make(params[i], i);
          }
        }
        return url + (s || '');
      },

      replacingString : function(str){
        return ReplaceModule.replace(str);
      },

      configureVarCol : function(varCol,opt){
        //varCol: global variable collection
        ReplaceModule.clearVars();
        var key, vlu, tmp, typ;
        for(var z=0, v = null, len = varCol.length;z<len;z++){
          v = varCol[z];
          if(v.id && (v.projEnvId === opt.selectedEnvironment)){
            key = util.getModelVal(v, 'key');
            vlu = processUtil.replacingString(util.getModelVal(v,'value'));
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
            VARS[key] = vlu;
          }
        }
        return VARS;
      },

      setupHeaderInTc : function(tc){
        var setHeaderFromRaw = false;

        if(tc.raw && tc.raw.enabled && tc.raw.content) {
          setHeaderFromRaw = tc.raw.resultType;
        }
        if(tc.headers){
          tc.headers.forEach(function(header){
            if(header.id && header.name && header.name.toLowerCase() === 'content-type'){
              setHeaderFromRaw = false;
            }
          });
        }
        if(setHeaderFromRaw === 'json' || setHeaderFromRaw === 'xml'){
          if(!Array.isArray(tc.headers)){
            tc.headers = [];
          }
          tc.headers.push({ id : 'VREST_CNT_HEADER', name : 'Content-Type', value : 'application/'+setHeaderFromRaw });
        }
        return tc;
      }
    };

function RunnerModel(ob){
  var self = this;
  Object.keys(ob).forEach(function(ky){
    if(ob.hasOwnProperty(ky)){
      self[ky] = ob[ky];
    }
  });
};

RunnerModel.prototype = {
  getTc : function(prop, withReplace){
    var op = { dontParse : true }, isParam = false;
    if(prop) {
      if(prop === 'headers'){ op.castInString = true; }
      else if(prop === 'params'){ isParam = true; }
      var forArray = function(sr){
        var ar = [];
        if(Array.isArray(sr)){
          var ln = sr.length;
          for(var k = 0; k < ln; k++){
            ar.push(_.extend({},sr[k]));
            if(withReplace){
              if(prop !== 'assertions' && ar[k].hasOwnProperty('name')){
                ar[k].name = ReplaceModule.replace(ar[k].name);
              }
              if(ar[k].hasOwnProperty('value')){
                ar[k].value = ReplaceModule.replace(ar[k].value);
                var prv = op.castInString, prvPs = op.dontParse, isString = false;
                if(isParam) {
                  isString = (ar[k].paramType === 'string');
                  op.castInString = isString;
                  op.dontParse = !(isString);
                }
                ar[k].value = processUtil.getReplacedStringifiedObject(ar[k].value, op);
                op.castInString = prv;
                op.dontParse = prvPs;
              }
              if(prop === 'assertions' && ar[k].hasOwnProperty('property')){
                ar[k].property = ReplaceModule.replace(ar[k].property);
              }
            }
          }
        }
        return ar;
      };
      var vl = this[prop];
      if(['raw','expectedResults'].indexOf(prop) !== -1){
        var ret = _.extend({},vl,vl.hasOwnProperty('headers') ? { headers : forArray(vl.headers) } : undefined);
        if(ret.hasOwnProperty('content') && withReplace){
          ret.content = ReplaceModule.replace(ret.content);
        }
      }
      if(['headers','params','assertions'].indexOf(prop) !== -1){
        return forArray(vl);
      }
      return (withReplace && (['url','condition'].indexOf(prop) !== -1)) ? ReplaceModule.replace(vl) : vl;
    }
  },

  getTcToExecute : function(){
    var ret = {
      method: this.getTc('method'),
      url : this.getTc('url',true),
      raw: this.getTc('raw',true),
      headers: this.getTc('headers',true),
      params: this.getTc('params',true),
      id : this.getTc('id')
    };
    ret.url = processUtil.completeURL(ret.url, ret.params);
    var authId = this.getTc('authorizationId');
    if(authId){
      ret.authorizationHeader = resolveAuthorization(authId);
    }
    this.lastSend = ret;
    return ret;
  },

  shouldRun : function(){
    var mk = this.getTc('condition',true);
    this.currentCondition = (typeof mk === 'string') ? mk : JSON.stringify(mk);
    if(typeof mk === 'string'){
      if(!(mk.length)){
        return true;
      }
      try {
        return Boolean(eval(mk));
      } catch(er){
        return true;
      }
    } else if(mk !== undefined && mk !== null){
      return Boolean(mk);
    } else {
      return true;
    }
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

var fetchSinglePage = function(url, page, pageSize, cb, next, vrunner){
  if(page===vrunner.totalPages) next();
  else if(typeof pages[page] === 'number') {
    afterFetch((pages[page-1] || 0), pages[page], cb, function(err){
      if(err) next(err);
      else fetchSinglePage(url, page+1, pageSize, cb, next, vrunner);
    }, vrunner);
    if(pages[page+1] === false) fetchSinglePage(url, page+1, pageSize, cb, next, vrunner);
  } else if(typeof pages[page] === 'string') {
    next(pages[page]);
  } else if(pages[page] === false) {
    pages[page] = true;
    request(url + '&pageSize=' + pageSize + '&currentPage=' + page, function(err, res, body){
      if(err || !body || body.error || !(Array.isArray(body.output)) || !(body.output.length)) {
        pages[page] = util.stringify(['Error found while fetching test cases at page '+page+' :', body]);
        fetchSinglePage(url, page, pageSize, cb, next, vrunner);
      } else if(!util.isNumber(body.total) || body.total > RUNNER_LIMIT){
        pages[page] = 'More than '+RUNNER_LIMIT+ ' test cases can not be executed in one go.';
      } else if(Array.isArray(body.output)){
        var ln = body.output.length;
        for(var n =0;n<ln;n++){
          MAIN_COLLECTION.push(new RunnerModel(processUtil.setupHeaderInTc(body.output[n])));
        }
        if(!page){
          if(Array.isArray(body.loops)){
            LOOPS = body.loops;
          }
          oneTimeCache(vrunner,body.output,body.total);
          fetchSinglePage(url, page, pageSize, cb, next, vrunner);
          vrunner.on('new_page', function(npage){
            if(vrunner.pageLoading){
              fetchSinglePage(url,npage,pageSize,cb,next,vrunner);
              vrunner.pageLoading = false;
            }
          });
        }
        pages[page] = ln;
        vrunner.emit('new_page', page);
      } else {
        next('Test cases not found.');
      }
    });
  } else {
    vrunner.pageLoading = true;
    vrunner.emit('log', 'Fetching page ' + (page+1) + ' (upto ' + pageSize + ' testcases) ...');
  }
};

var findLastTcWithId = function(currentIndex, findWithId){
  for(var z = currentIndex;z>=0;z--){
    if(MAIN_COLLECTION[z].id === findWithId){
      return z;
    }
  }
};

var afterFetch = function(st, en, cb, next, vrunner){
  var forEachTc = function(index){
    if(index < en && index < vrunner.totalRecords){
      cb(MAIN_COLLECTION[index], function(){
        var nIndex = vrunner.setupLoopAlgo(index);
        forEachTc(typeof nIndex === 'number' ? nIndex : (index+1));
      });
    } else {
      next();
    }
  };
  forEachTc(st);
};

var oneTimeCache = function(vrunner,records,total){
  vrunner.emit("log", "Executing test cases ... (Please wait, it may take some time.)");
  vrunner.initAll(total);
  pages[0] = records;
};

var fetchAndServe = function(url, pageSize, cb, next, vrunner){
  fetchSinglePage(url, 0, pageSize, cb, next, vrunner);
};

var hasRunPermission = function(instance, project, next){
  request(V_BASE_URL+'user/hasPermission?prefetchRunnerData=true&permission=RUN_TEST_CASES&project='+project+'&instance='+instance,
  function(err,res,body){
    if(err || !body || body.error) next(['Error while checking execute permission  :', err||body], 'VRUN_OVER');
    else if(!body.output) next('Internal permission error.', 'VRUN_OVER');
    else if(body.output.permit !== true) next('NO_PERMISSION_TO_RUN_TESTCASE_IN_PROJECT', 'VRUN_OVER');
    else next(null,body.output.project, body.output.prefetch, body.output.projectuser);
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
  var filters = filterData;
  filters.currentPage = 0;
  filters.pageSize = 100;
  request({ method: 'POST', uri: instanceURL+'/g/testrun',
    body: { name : util.getReadableDate(), projectId : true, filterData : filters } }, function(err,res,body){
      if(err || !body || body.error) next(['Error while creating test run : ',err||body]);
      else next(null,body.output);
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
      return (new OAuth1(authConfig, tc.method, tc.url)).getAuthHeader();
    };
  } else if(authType === 'oauth2.0'){
    return getOAuthTwoHeader(ath);
  }
}, resolveAuthorization = function(authorizationId){
  if(typeof MAIN_AUTHORIZATIONS[authorizationId] === 'function'){
    return MAIN_AUTHORIZATIONS[authorizationId](tc);
  } else {
    return MAIN_AUTHORIZATIONS[authorizationId];
  }
};

var fireRequest = function(tc, trtc, callback){
  runner({ testcase : tc },function(result){
    var afterWait = function(){
      if(!result || result.err) {
        //console.log(result);
      }
      if(result.runnerCase) {
        trtc.runnerCase = result.runnerCase;
        trtc.runnerCase.headers = util.stringify(result.runnerCase.headers, true);
      }
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
    tp = processUtil.replacingString(path);
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
      ret.assertion.property = processUtil.getReadableString(ass.property,true);
      ret.assertion.value = processUtil.getReadableString(ass.value,true);
      ret.assertion.actual = ops.setActual || ops.ac;
    }
  }
  return ret;
};


var extractVarsFrom = function(tcVariables, result, headers) {
  if(result && result.resultType){
    var opts = { prefixes : ['',{}] }, jsonData = processUtil.getJsonOrString(result.content), tp;
    (tcVariables || []).forEach(function(vr){
      if(vr.name && vr.path && vr.type === 'json'){
        if(vr.path.indexOf(config.meta.startVarExpr) === 0 && vr.path.indexOf(config.meta.endVarExpr) !== -1){
          opts.prefixes[0] = result.content;
          opts.prefixes[1].headers = headers;
          opts.prefixes[1].statusCode = result.statusCode;
          VARS[vr.name] = ReplaceModule.replace(vr.path,opts);
        } else if(result.resultType === 'json') {
          VARS[vr.name] = getJSONPathValue(getJsonPath(vr.path), jsonData);
        }
      }
    });
  }
  return;
};

var findExAndAc = function(curVars, headersMap, ass, actualResults, actualJSONContent, executionTime){
  if(util.v_asserts.shouldAddProperty(ass.name)) {
    ass.property = processUtil.replacingString(ass.property, curVars, publicConfiguration);
  } else delete ass.property;
  if(!util.v_asserts.shouldNotAddValue(ass.name, ass.type, config)) {
    ass.value = processUtil.getReplacedStringifiedObject(ass.value, { dontParse : true });
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
  var actualResults = runnerModel.result,
    toSendTC = _.extend(runnerModel.lastSend, { expectedResults : tc.getTc('expectedResults',true) }),
    toSendTRTC = { headers : headersMap },
    jsonSchema = (tc.expectedResults && tc.expectedResults.contentSchema) || '{}';
  toSendTC.expectedResults.contentSchema = processUtil.getJsonOrString(jsonSchema);
  toSendTRTC.actualResults = actualResults;
  setFinalExpContent(toSendTC.expectedResults, toSendTRTC.actualResults, curVars);
  applyToValidator.push(toSendTC, toSendTRTC, ReplaceModule.getFuncs());
  runnerModel.expectedContent = toSendTC.expectedResults.content;
};


var setFinalExpContent = function(er,ar,curVars){
  var toSet = false;
  if(util.isWithVars(er.content)){
    var spcl = START_VAR_EXPR + '*' + END_VAR_EXPR, spclFl = '"'+spcl+'"';
    toSet = true;
    if(er.content === spclFl) {
      er.content = ar.content;
    } else if(er.resultType === 'json'){
      var spclIn = er.content.indexOf(spclFl), isSpcl = (spclIn !== -1), exCont = processUtil.getJsonOrString(er.content);
      if(typeof exCont === 'object'){
        if(isSpcl) exCont = util.mergeObjects(exCont, processUtil.getJsonOrString(ar.content), { spcl : spcl });
        er.content = util.stringify(exCont);
      }
    } else {
      er.content = processUtil.replacingString(er.content);
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
  var actualJSONContent = processUtil.getJsonOrString(actualResults.content),
      findEx = findExAndAc.bind(undefined, runnerModel.variable, headers),
    applyToValidator = [], initForVal = initForValidator.bind(undefined, headers),
    ret = [], asserting = assert.bind(undefined, validatorIdCodeMap);
  (tc.getTc('assertions') || []).forEach(function(ass){
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
  if(opts.debugging !== true){
    ReplaceModule.init({ V_DEBUG : function(){} });
  }
  if(opts.nosslcheck === true){
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    delete opts.nosslcheck;
  }
  var dk, error, queryObject;
  for(dk in options){
    if(dk === 'authorizations'){
      MAIN_AUTHORIZATIONS = options[dk];
    } else {
      this[dk] = options[dk];
    }
  }
  if(util.isObject(opts)){
    for(dk in opts){
      this[dk] =  opts[dk];
    }
  }
  if(loggers.indexOf(this.logger) === -1)  throw new Error('vRunner : Please input a valid logger.');
  if(this.logger !== 'console' && !this.filePath) {
    this.filePath = pathUtil.resolve('vrest_logs','logs');
    if(this.logger === 'json') this.filePath += '.json';
    else if(this.logger === 'xunit') this.filePath += '.xml';
    else if(this.logger === 'csv') this.filePath += '.csv';
  }
  this.logger = require('./logger/'+this.logger)({ runner : this });
  error = util.validateObj(this.credentials, { email : { regex : EMAIL_REGEX }, password : 'string' });
  if(error) throw new Error('vRunner : INVALID_CREDENTIALS : ' + error);
  if(typeof this.url !== 'string' || !this.url) throw new Error('vRunner : URL to fetch test cases not found.');
  queryObject = util.parseQuery(this.url);
  error = util.validateObj(queryObject, { projectId : { regex : MONGO_REGEX } });
  if(error) throw new Error('vRunner : INVALID_QUERY_STRING : ' + error);
  delete queryObject.currentPage;
  delete queryObject.pageSize;
  delete queryObject.saveFilter;
  this.projectId = queryObject.projectId;
  this.filters = queryObject;
  this.instanceName = getInstanceName(this.url);
  this.instanceURL = V_BASE_URL+ORG_URL_PREFIX+this.instanceName;
  this.url = this.instanceURL + '/g/testcase' + mainUrlUtil.format({ query : queryObject });
  this.pendingTrtc = [];
  this.stopped = false;
  this.noPassed = 0; this.noFailed =0; this.noNotExecuted = 0; this.notRunnable = 0;
  var self = this;
  process.on( 'SIGINT', function() {
    self.emit('log',"\nPlease wait, Stopping test case execution ...");
    self.stopped = true;
  });
};

var setupLoopAlgo = function(runModelIndex){
  var runModel = MAIN_COLLECTION[runModelIndex];
  if(runModel){
    var tsId = runModel.testSuiteId;
    var lp = LOOPS.filter(function(lp){ return lp.endTCId === runModel.id && lp.testSuiteId === tsId; })[0];
    if(lp){
      var lpStart = lp.startTCId, nIndex = findLastTcWithId(runModelIndex,lpStart);
      if(typeof nIndex === 'number'){
        var stMod = MAIN_COLLECTION[nIndex];
        if(stMod && tsId === stMod.testSuiteId && nIndex !== -1 && nIndex <= runModelIndex && this.shouldLoop(lp)){
          this.totalRecords = this.totalRecords + runModelIndex - nIndex + 1;
          (VARS.$)++;
          return nIndex;
        }
      }
    }
  }
};

var shouldLoop = function(lp){
  if(typeof lp.maxCount !== 'number' || isNaN(lp.maxCount)){
    var src = processUtil.replacingString(lp.get('source'));
    var nm = Math.floor(src), isNN = isNaN(nm);
    if(isNN){
      try {
        if(typeof src === 'string'){
          src = JSON.parse(src);
        }
        lp.maxCount = Array.isArray(src) ? src.length : false;
      } catch(err){
        lp.maxCount = false;
      }
    } else {
      lp.maxCount = nm;
    }
    if(lp.maxCount === false && processUtil.isConditionPassed(src, false) === true) return true;
  }
  if(lp.maxCount > ((VARS.$)+1)){
    return true;
  } else {
    VARS.$ = 0;
    return false;
  }
};

vRunner.prototype = new events.EventEmitter;

vRunner.prototype.shouldLoop = shouldLoop;
vRunner.prototype.setupLoopAlgo = setupLoopAlgo;

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
  this.totalRecords = total;
  this.totalPages = Math.ceil(total/this.pageSize);
  for(var z=0;z<this.totalPages;z++){
    pages[z] = false;
  }
};

vRunner.prototype.saveReport = function(error, url, report, next, stopped){
  var self = this;
  if(!stopped) stopped = this.stopped;
  request({ method : 'PATCH', url : url, body : {
    statistics: {
      total : report.total,
      passed : report.passed,
      failed: report.failed,
      notExecuted: report.notExecuted,
      notRunnable: report.notRunnable
    }, remarks : error ?
        (stopped ? (typeof stopped === 'string' ? stopped : 'Test run was stopped by user.')
          : util.cropString(util.stringify(error), RUNNER_LIMIT)) :
        getRemarks(report.total, report.passed, report.failed, report.notExecuted, report.notRunnable)
  }}, function(err,response,body){
    if(error) self.emit('end',error);
    else if(err || !body || body.error) self.emit('end',['Error while saving report : ', err||body]);
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
    if(err || !body || body.error) next("Error while logging into vREST.\n" + util.stringify(err||body), 'VRUN_OVER');
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
      toSend.list = self.pendingTrtc;
    }
    self.pendingTrtc = [];
    request({ method: 'POST', uri: instanceURL+'/bulk/testruntestcase', body: toSend }, function(err,res,body){
      if(err || !body || body.error) {
        self.emit('warning',util.stringify(err||body||'Connection could not be established to save the execution results.',true,true));
      }
    });
    next(null);
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
  var self = this, report = { total : 0, passed : 0, failed : 0, notExecuted : 0, notRunnable : 0 };
  var tasks = [
    function(cb){
      self.sigIn(cb);
    },
    function(cb){
      self.emit('log', 'Checking permission to execute test cases in project ...');
      hasRunPermission(self.instanceName,self.projectId,function(err,projectKey, prefetch, proju){
        if(err) cb(err);
        else {
          self.stopUponFirstFailureInTestRun = Boolean(proju.action && proju.action.stopUponFirstFailureInTestRun);
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
              MAIN_AUTHORIZATIONS[auths[k].id] = getAuthHeader(auths[k]);
            }
          }
          cb();
        }
      });
    },
    function(cb){
      findHelpers(self, 'publicConfiguration', function(err,body){
        if(err || !body || body.error) cb(['Error while fetching '+what+'s :', err||body], 'VRUN_OVER');
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
          processUtil.configureVarCol(vars, { selectedEnvironment : self.selectedEnvironment });
          cb();
        }
      });
    },
    function(cb){
      self.emit('log', 'Creating test run ...');
      createTestRun(self.instanceURL,self.filters,function(err,testrun){
        if(err) cb(err, 'VRUN_OVER');
        else {
          console.log('INFO => Test run name : '+testrun.name);
          self.testRunName = testrun.name;
          self.testRunId = testrun.id;
          cb();
        }
      });
    },
    function(cb){
      fetchAndServe(self.url, self.pageSize, function(tc,cb0){
        tc.exStatusAll = findTcVarsName(tc,'trtc') || false;
        tc.exStatusLoop = findTcVarsName(tc,'loop') || false;
        var trtc = {
          result: {
            headers : [],
            statusCode : 0,
            content: '',
            resultType: 'text'
          },
          isExecuted: false,
          testRunId : self.testRunId,
          loopIndex : VARS.$,
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
            else cb0();
          });
        };
        var handleAPIResponse = function(result, err, notRunnable){
          var isPassed = false, remarks = '', isExecuted = false;
          if(!result) {
            remarks = 'Test run was stopped by user.';
          } else if(notRunnable) {
            if(typeof notRunnable === 'string'){
              trtc.result.content = notRunnable;
              remarks = 'Test case condition was failed, so was not runnable.';
            } else {
              remarks = 'Test case was not runnable.';
            }
          } else if(result === undefined || result === null) {
            remarks = 'An unknown error occurred while receiving response for the Test case.';
          } else if(err) {
            remarks = 'An error has occurred while executing this test case. Error logged : ' + JSON.stringify(err);
            setStatusVar(VARS,tc.exStatusAll,tc.exStatusLoop,0);
          } else {
            isExecuted = true;
            var actualResults = getActualResults(result);
            trtc.result = actualResults;
            extractVarsFrom(tc.getTc('tcVariables'), actualResults, result.headers);
            isPassed = assertResults(trtc,tc, self.validatorIdCodeMap);
            setStatusVar(VARS,tc.exStatusAll,tc.exStatusLoop,isPassed ? 2 : 1);
          }
          isPassed = isPassed === true;
          if(report.total > RUNNER_LIMIT){
            self.stopped = 'Total number of execution records crossed the maximum limit of '+RUNNER_LIMIT;
          } else if(self.stopUponFirstFailureInTestRun && (!isPassed && tc.runnable)){
            self.stopped = true;
          }
          if(!trtc.remarks) trtc.remarks = remarks;
          trtc.isExecuted = isExecuted;
          trtc.isPassed = isPassed;
          over();
        };
        var forNotRunnable = function(cond){
          setStatusVar(VARS,tc.exStatusAll,tc.exStatusLoop,-1);
          self.handleAPIResponse(null, null, cond || true);
        };
        if(tc.getTc('runnable') === false){
          forNotRunnable();
        } else {
          processUtil.extractPathVars(tc.params);
          if(tc.shouldRun()){
            trtc.executionTime = new Date().getTime();
            var afterWait = function(){
              fireRequest(tc.getTcToExecute(),trtc,function(result){
                handleAPIResponse(result.response, result.err);
              });
            };
            var wf = tc.getTc('waitFor');
            if(wf) setTimeout(afterWait, wf*1000);
            else afterWait();
          } else {
            forNotRunnable(tc.currentCondition);
          }
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
