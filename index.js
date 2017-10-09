/*
 * vrunner
 * https://vrest.io
 *
 * Copyright (c) 2015 vREST Team
 * Licensed under the MIT license.
 */

'use strict';

var request = require('request').defaults({ jar: true, json: true, headers: { 'x-vrest-request-source': 'vrunner' } }),
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
    DOMParser = require('xmldom').DOMParser,
    X_PATH = require('xpath'),
    btoa = require('btoa'),
    mainUrlUtil = require('url'),
    V_BASE_URL = 'https://vrest.io/',
    publicConfiguration = {},
    RUNNER_LIMIT = 5000,
    LOOP_LIMIT = 100,
    EMAIL_REGEX = /^\S+@\S+\.\S+$/,
    ORG_URL_PREFIX = 'i/',
    START_VAR_EXPR = '{{',
    END_VAR_EXPR = '}}',
    TRTC_BATCH = 5,
    MONGO_REGEX = /^[0-9a-fA-F]{24}$/,
    _ = {
      extend: util.extend.bind(util),
      isEmpty: util.isEmpty.bind(util)
    },
    pages,
    MAIN_AUTHORIZATIONS,
    SAVING_RESULTS,
    MAIN_COLLECTION,
    PRE_HOOK_COL,
    POST_HOOK_COL,
    NO_OF_EXECUTED,
    PRTR_HOOK_COL,
    PSTR_HOOK_COL,
    LOOPS,
    JSONSchemasRefs,
    options,
    replacingString,
    VARS,
    findHelpers,
    config;

function initAll() {
  pages = [false];
  MAIN_AUTHORIZATIONS = {};
  SAVING_RESULTS = 0;
  MAIN_COLLECTION = [];
  PRE_HOOK_COL = [];
  POST_HOOK_COL = [];
  NO_OF_EXECUTED = 0;
  PRTR_HOOK_COL = [];
  PSTR_HOOK_COL = [];
  LOOPS = [];
  JSONSchemasRefs = [];
  options = {
    credentials : {},
    logger : 'console',
    varColMap : {},
    projEnv : undefined,
    exitOnDone : true,
    pageSize : 100,
    authorizations : {},
    validatorIdCodeMap : {}
  };
  config = {
    invalidLpCond : 'V_INVALID_LOOP',
    meta : publicConfiguration
  };
  replacingString = ReplaceModule.replace;
  VARS = ReplaceModule.getVars();
  VARS.$ = 0;
  TotalRecords = 0;
  findHelpers = function(prefetch, vrunner, what, next){
    vrunner.emit('log', 'Finding '+what+'s ...');
    if(what === 'publicConfiguration'){
      if(typeof prefetch[what] !== 'object') prefetch[what] = {};
    } else {
      if(!Array.isArray(prefetch[what])) prefetch[what] = [];
    }
    next(null,prefetch[what]);
  };
};

  var XML_EQUAL_SIGN = '{{*}}', XML_EQUAL_TO = '{{*}}';

  function isValidXMLStar(vl){
    return (ReplaceModule.isWithVars(vl) && (vl.trim()) === XML_EQUAL_SIGN);
  }

  // Changes XML to JSON, https://davidwalsh.name/convert-xml-json
  function xmlToJson(xml,withStar) {

    // Create the return object
    var obj = {};

    if (xml.nodeType == 1) { // element
      // do attributes
      if (xml.attributes.length > 0) {
      obj["@attributes"] = {};
        for (var j = 0; j < xml.attributes.length; j++) {
          var attribute = xml.attributes.item(j);
          obj["@attributes"][attribute.nodeName] =
            (withStar && isValidXMLStar(attribute.nodeValue))? XML_EQUAL_TO : attribute.nodeValue;
        }
      }
    } else if (xml.nodeType == 3) { // text
      obj = getTextContent(xml.nodeValue);
    } else if (xml.nodeType == 4) { // text
      return xml.textContent;
    }

    // do children
    if (xml.hasChildNodes()) {
      for(var i = 0; i < xml.childNodes.length; i++) {
        var item = xml.childNodes.item(i);
        var nodeName = item.nodeName;
        if (typeof(obj[nodeName]) == "undefined") {
          obj[nodeName] = xmlToJson(item,withStar);
        } else if(nodeName !== '#text'){
          if (typeof(obj[nodeName].push) == "undefined") {
            var old = obj[nodeName];
            obj[nodeName] = [];
            obj[nodeName].push(old);
          }
          obj[nodeName].push(xmlToJson(item,withStar));
        }
      }
    }
    if(withStar && isValidXMLStar(obj['#text'])){
      obj['#text'] = XML_EQUAL_TO;
    };
    return obj;
  };

  function getTextContent(str){
    return str.trim();
  }

    var NOT_RES = 'V_PATH_NOT_RESOLVED', XMLPath;

    var domParser;
    if(typeof DOMParser === 'function'){
      domParser = new DOMParser();
    }
    if(domParser === undefined){
      domParser = { parseFromString : function(){ return false; } }
      XMLPath = function(){ return NOT_RES; };
    } else {
      XMLPath = function(XMLNode,path){
        try {
          var headings = X_PATH.evaluate(path,XMLNode,null,X_PATH.XPathResult.ANY_TYPE,null);
        } catch(erm){
          return NOT_RES;
        }
        var thisHeading = (headings && headings.iterateNext()), resp = "";
        if(thisHeading){
          while (thisHeading) {
            if(resp) resp += '\n';
            resp += getTextContent(thisHeading.textContent);
            thisHeading = headings.iterateNext();
          }
          return resp;
        } else {
          return NOT_RES;
        }
      };
    }

    var getJsonPath = function(path){
      if(typeof path === 'string' && path.length) {
        if(path.charAt(0) === '$') return path;
        return '$'+(path.charAt(0) === '[' ? '' : '.') + path;
      }
    }, getJsonOrString = function(vlm,tp){
      if(typeof vlm === 'string'){
        if(tp === 'json' || tp !== 'xml'){
          return processUtil.getJsonOrString(vlm);
        } else {
          var abm = domParser.parseFromString(vlm,'application/xml');
          return abm;
        }
      }
      return vlm;
    }, parseFromContentAndSet = function(result, prop, isEx){
      var prop = (prop || '') + 'parsedContent';
      if(!(result.hasOwnProperty(prop))){
        result._parsedContent = getJsonOrString(result.content,result.resultType);
        if(result._parsedContent){
          if(result.resultType === 'json'){
            result.parsedContent = result._parsedContent;
          } else if(result.resultType === 'xml' && prop.charAt(0) === 'p'){
            result.parsedContent = xmlToJson(result._parsedContent, isEx);
          }
        }
      }
      return result[prop];
    };

    var getJSONPathValue = function(json, path, wth){
      var ifNotResolved = ReplaceModule.replace, tm, ret = 'V_PATH_NOT_RESOLVED', tp;
      if(wth !== 'xml'){
        tm = JSONPath;
        path = getJsonPath(path);
        if(typeof(json) != 'object' || !json) return ret;
      } else {
        tm = XMLPath;
      }
      ret = tm(json, path);

      if(ret === 'V_PATH_NOT_RESOLVED' && typeof ifNotResolved === 'function') {
        tp = ifNotResolved(path);
        if(tp !== path) ret = tm(json, tp);
      }
      if(Array.isArray(ret) && ret.length === 1) return ret[0];
      else return ret;
    };

    var TotalRecords;

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

      getJsonOrString: ReplaceModule.getJsonOrString,

      getReadableString : function(st,blank){
        if(blank && (st === undefined || st === null)) return '';
        if(typeof st === 'string') return st;
        if(typeof st === 'object') return JSON.stringify(st);
        return String(st);
      },

      getReplacedStringifiedObject : ReplaceModule.getReplacedStringifiedObject,

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
        if(!(opt.dontClear)) ReplaceModule.clearVars();
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

      isConditionPassed : function(mk,def){
        var evl;
        if(def !== false) def = true;
        if(typeof mk === 'string'){
          if(!(mk.length)){
            return def;
          }
          try {
            evl = eval(mk);
          } catch(er){
            return 'INVALID_CONDITION`'+mk+'`:'+(er.message||'');
          }
        } else if(mk !== undefined && mk !== null){
          evl = mk;
        }
        if(evl === true || evl === 'true') {
          return true;
        } else if(evl === false || evl === 'false') {
          return false;
        } else {
          return def;
        }
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
  this.canHook = true;
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
                var prv = op.castInString, prvPs = op.dontParse, isString = false;
                if(isParam) {
                  isString = (ar[k].paramType === 'string');
                  op.castInString = isString;
                  op.dontParse = (isString);
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
      var vl = this[prop], ts = vl;
      if(['raw','expectedResults'].indexOf(prop) !== -1){
        var ts = _.extend({},vl,vl.hasOwnProperty('headers') ? { headers : forArray(vl.headers) } : undefined);
        if(ts.hasOwnProperty('content') && withReplace){
          ts.content = processUtil.getReplacedStringifiedObject(ts.content, { castInString : true });
        }
      }
      if(['headers','params','assertions'].indexOf(prop) !== -1){
        return forArray(ts);
      }
      return (withReplace && (['url','condition','externalId'].indexOf(prop) !== -1)) ? ReplaceModule.replace(ts) : ts;
    }
  },

  resetProps : function(){
    delete this.currentCondition;
    delete this.exStatusAll;
    delete this.exStatusLoop;
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
      ret.authorizationHeader = resolveAuthorization(authId,ret);
      ret.authTokens = getOAuth1Tokens(authId,ret);
    }
    this.lastSend = ret;
    return ret;
  },

  shouldRun : function(){
    var mk = this.getTc('condition',true);
    this.currentCondition = (typeof mk === 'string') ? mk : JSON.stringify(mk);
    if(this.currentCondition === config.invalidLpCond){
      return false;
    }
    return processUtil.isConditionPassed(mk);
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
      if(err || !body || body.error) {
        pages[page] = util.stringify(['Error found while fetching test cases at page '+page+' :', body]);
        fetchSinglePage(url, page, pageSize, cb, next, vrunner);
      } else if(!(Array.isArray(body.output)) || !(body.output.length)) {
        vrunner.emit('warning','No test case found at page '+page+'. Test run is completed.');
        next();
      } else if(!util.isNumber(body.total) || body.total > RUNNER_LIMIT){
        pages[page] = 'More than '+RUNNER_LIMIT+ ' test cases can not be executed in one go.';
      } else {
        var ln = body.output.length;
        for(var n =0;n<ln;n++){
          body.output[n].position = TotalRecords + n;
          MAIN_COLLECTION.push(new RunnerModel(processUtil.setupHeaderInTc(body.output[n])));
        }
        TotalRecords += ln;
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
        pages[page] = ln + (typeof pages[page-1] === 'number' ? pages[page-1] : 0);
        vrunner.emit('new_page', page);
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
      vrunner.setupLoopAlgo(index,true);
      PRE_HOOK_RUNNER.currTcIndex = NO_OF_EXECUTED;
      callOneQ(PRE_HOOK_RUNNER,PRE_HOOK_COL,function(){
        cb(MAIN_COLLECTION[index], function(){
          POST_HOOK_RUNNER.currTcIndex = NO_OF_EXECUTED - 1;
          callOneQ(POST_HOOK_RUNNER,POST_HOOK_COL,function(){
            var nIndex = vrunner.setupLoopAlgo(index);
            forEachTc(typeof nIndex === 'number' ? nIndex : (index+1));
          });
        });
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

var forOneTc = function(report,tc,cb0){
  var self = this;
  tc.resetProps();
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
    loopIndex : typeof self.loopIndex === 'number' ? self.loopIndex : VARS.$,
    tcIndex : typeof self.currTcIndex === 'number' ? self.currTcIndex : NO_OF_EXECUTED,
    testCaseId : tc.id,
    position : tc.position || 0,
    executionTime: 0
  };
  var over = function(){
    report.total++;
    if(tc.canHook){ NO_OF_EXECUTED++; }
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
    self.sendToServer(trtc);
    if(!self.stopped){ cb0(); }
  };
  var handleAPIResponse = function(result, err, notRunnable){
    var isPassed = false, remarks = '', isExecuted = false;
    var wt = (tc.canHook ? 'Case': 'Hook');
    if(self.stopped === true && !result) {
      remarks = 'Test run was stopped by user.';
    } else {
      if(notRunnable) {
        if(typeof notRunnable === 'string'){
          trtc.result.content = notRunnable;
          if(tc.condition === config.invalidLpCond){
            remarks = 'Loop source was invalid. It must be an array variable or a number.';
          } else {
            remarks = 'Test '+ wt +' condition was failed, so was not runnable.';
          }
        } else {
          remarks = 'Test '+ wt +' was not runnable.';
        }
      } else if(err) {
        remarks = 'An error has occurred while executing this test '+ wt +'. Error logged : ' + JSON.stringify(err);
        setStatusVar(VARS,tc.exStatusAll,tc.exStatusLoop,0);
      } else if(result === undefined || result === null) {
        remarks = 'An unknown error occurred while receiving response for the Test '+ wt +'.';
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
      trtc.isExecuted = isExecuted;
      trtc.isPassed = isPassed;
    }
    if(!trtc.remarks) trtc.remarks = remarks;
    VARS.$tc.execution = {
      request : _.extend({},trtc.runnerCase),
      response : {
        headers : util.stringify((result && result.headers) || {},false,true),
        body : (result && result.body) || ''
      },
      executionTime : trtc.executionTime,
      remarks : trtc.remarks,
      statusCode : (result && result.statusCode) || 0
    };
    try {
      VARS.$tc.execution.request.headers = util.stringify(VARS.$tc.execution.request.headers)
    } catch(erm){ }
    VARS.$tc.result = {
      isExecuted : trtc.isExecuted,
      isPassed : trtc.isPassed,
      isRunnable : trtc.isExecuted || Boolean(notRunnable),
      resultLink : (self.instanceURL+'/'+self.projectKey+'/testcase') +
        '?testRunId='+self.testRunId+'&showResponse=true&queryText='+trtc.testCaseId+'&loopIndex='+VARS.$
    };
    self.emit('after-post-tc',VARS.$tc);
    if(tc.canHook){
      if(report.total >= (RUNNER_LIMIT - 1)){
        self.stopped = 'Total number of execution records crossed the maximum limit of '+RUNNER_LIMIT;
      } else if(self.stopUponFirstFailureInTestRun && (!isPassed && tc.runnable)){
        self.stopped = true;
      }
    }
    over();
  };
  var forNotRunnable = function(cond){
    setStatusVar(VARS,tc.exStatusAll,tc.exStatusLoop,-1);
    handleAPIResponse(null, null, cond || true);
  };
  if(self.stopped || tc.getTc('runnable') === false){
    forNotRunnable();
  } else {
    processUtil.extractPathVars(tc.params);
    var shouldRunVal = tc.shouldRun();
    if(shouldRunVal === true){
      trtc.executionTime = new Date().getTime();
      var afterWait = function(){
        if(self.stopped) { return forNotRunnable(); }
        VARS.$tc.details = {
          id : tc.id,
          externalId : tc.getTc('externalId',true),
          summary : tc.getTc('summary'),
          position : trtc.position,
          loopIndex : trtc.loopIndex
        };
        VARS.$tc.request = {
          url : tc.getTc('url'), method : tc.getTc('method'),
          params : tc.getTc('params'), headers : tc.getTc('headers')
        };
        if(VARS.$tc.request.method !== 'GET'){
          VARS.$tc.request.rawBody = tc.getTc('raw').content;
        }
        try {
          var tcToExecute = tc.getTcToExecute();
        } catch(err){
          console.log(err);
          return handleAPIResponse(null, err.message || err);
        }
        VARS.$tc.authorization = tcToExecute.authTokens;
        delete tcToExecute.authTokens;
        fireRequest(tcToExecute,trtc, self.timeout, function(result){
          handleAPIResponse(result.response, result.err);
        });
      };
      var wf = tc.getTc('waitFor');
      if(wf) setTimeout(afterWait, wf*1000);
      else afterWait();
    } else {
      forNotRunnable(shouldRunVal || tc.currentCondition);
    }
  }
};

function HookRunner(trId,instanceURL,validatorIdCodeMap,timeout){
  this.testRunId = trId;
  this.noPassed = 0; this.noFailed = 0; this.noNotExecuted = 0; this.notRunnable = 0;
  this.report = { noPassed : this.noPassed, noFailed : this.noFailed,
    noNotExecuted : this.noNotExecuted, notRunnable : this.notRunnable };
  this.pendingTrtc = [];
  this.filters = {};
  this.stopped = false;
  this.instanceURL = instanceURL;
  this.stopUponFirstFailureInTestRun = false;
  this.validatorIdCodeMap = validatorIdCodeMap;
  this.loopIndex = 0;
  this.currTcIndex = 0;
  this.timeout = timeout;
  this.pushResultName = 'testruntesthook';
};

HookRunner.prototype.emit = function(){};

HookRunner.prototype.forOneTc = forOneTc;

HookRunner.prototype.sendToServer = function(trtc){
  var self = this;
  var sendNow = function(count){
    var toSend = {};
    if(count){
      toSend.count = count;
      toSend.testRunId = self.testRunId;
      toSend.loopIndex = VARS.$;
      toSend.filterData = self.filters;
    } else {
      toSend.list = self.pendingTrtc;
    }
    self.pendingTrtc = [];
    var lastOp = function(err,res,body){
      SAVING_RESULTS--;
      var ster = (res && res.statusCode) !== 200;
      if(err || !body || body.error || ster) {
        self.emit('warning',
          util.stringify(err||body||ster ? 'Result could not be saved due to some unknown error.'
            : 'Connection could not be established to save the execution results.',true,true));
      }
    };
    SAVING_RESULTS++;
    request({ method: 'POST', uri: self.instanceURL+'/bulk/'+(self.pushResultName || 'testruntestcase'), body: toSend }, lastOp);
  };
  if(trtc === 'OVER'){
    if(this.pendingTrtc.length) sendNow();
    if(this.currTcIndex === undefined){
      PRE_HOOK_RUNNER.sendToServer('OVER');
      POST_HOOK_RUNNER.sendToServer('OVER');
    }
  } else if(typeof trtc === 'number' && trtc && this.stopped){
    sendNow(trtc);
  } else if(typeof trtc === 'object' && trtc) {
    var op = ['result', 'expectedResults'], lop = op.length;
    for(var nm = 0; nm < lop; nm++){
      if(trtc.hasOwnProperty(op[nm])){
        delete trtc[op[nm]].parsedContent;
        delete trtc[op[nm]]._parsedContent;
        if(typeof trtc[op[nm]].contentSchema === 'object'){
           trtc[op[nm]].contentSchema = JSON.stringify(trtc[op[nm]].contentSchema);
        }
      }
    }
    this.pendingTrtc.push(trtc);
    if(this.pendingTrtc.length === TRTC_BATCH) sendNow();
  }
};

var PRE_HOOK_RUNNER, POST_HOOK_RUNNER, PRTR_HOOK_RUNNER, PSTR_HOOK_RUNNER;

var callOneQ = function(withRunner,qu,after,ind){
  if(!ind) ind = 0;
  if(!(Array.isArray(qu)) || !(qu.length) || ((withRunner.currTcIndex < 0) && (ind === qu.length || !(qu[ind])))){
    withRunner.sendToServer('OVER');
    return after();
  }
  if(qu[ind]){
    withRunner.forOneTc(withRunner.report,qu[ind],function(){
      withRunner.loopIndex++;
      callOneQ(withRunner,qu,after,ind+1);
    });
  } else {
    after();
  }
};

var fetchAndServe = function(url, pageSize, cb, next, vrunner){
  request(vrunner.instanceURL+'/g/testhook?currentPage=0&pageSize=100&projectId='+vrunner.projectId, function(err,bod,res){
    if(err || !res || res.error) return next(['Error while fetching hooks :', err||res], 'VRUN_OVER');
    res.output.forEach(function(abs,pos){
      var abs = new RunnerModel(processUtil.setupHeaderInTc(abs));
      abs.canHook = false;
      abs.position = pos;
      if(abs.testSuiteId === 0){
        PRTR_HOOK_COL.push(abs);
      } else if(abs.testSuiteId === 1){
        PRE_HOOK_COL.push(abs);
      } else if(abs.testSuiteId === 2){
        POST_HOOK_COL.push(abs);
      } else if(abs.testSuiteId === 3){
        PSTR_HOOK_COL.push(abs);
      }
    });
    PRE_HOOK_RUNNER = new HookRunner(vrunner.testRunId,vrunner.instanceURL, vrunner.validatorIdCodeMap,vrunner.timeout);
    POST_HOOK_RUNNER = new HookRunner(vrunner.testRunId,vrunner.instanceURL, vrunner.validatorIdCodeMap,vrunner.timeout);
    PRTR_HOOK_RUNNER = new HookRunner(vrunner.testRunId,vrunner.instanceURL, vrunner.validatorIdCodeMap,vrunner.timeout);
    PRTR_HOOK_RUNNER.currTcIndex = -1;
    PSTR_HOOK_RUNNER = new HookRunner(vrunner.testRunId,vrunner.instanceURL, vrunner.validatorIdCodeMap,vrunner.timeout);
    PSTR_HOOK_RUNNER.currTcIndex = -2;
    VARS.$tr.details = {
      id : vrunner.testRunId,
      createdAt : vrunner.testRunCreatedAt,
      name : vrunner.testRunName,
      executor : { name : vrunner.userFullName, email : vrunner.credentials.email }
    };
    callOneQ(PRTR_HOOK_RUNNER,PRTR_HOOK_COL,function(){
      fetchSinglePage(url, 0, pageSize, cb, next, vrunner);
    });
  });
};

var hasRunPermission = function(instance, project, next){
  request(V_BASE_URL+'user/hasPermission?prefetchRunnerData=true&permission=RUN_TEST_CASES&project='+project+'&instance='+instance,
  function(err,res,body){
    if(err || !body || body.error) next(['Error while checking execute permission  :', err||body], 'VRUN_OVER');
    else if(!body.output) next('Internal permission error.', 'VRUN_OVER');
    else if(body.output.permit !== true) next('NO_PERMISSION_TO_RUN_TESTCASE_IN_PROJECT', 'VRUN_OVER');
    else next(null,body.output.project, body.output.prefetch, body.output.projectuser, body.output.user);
  });
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
}, resolveAuthorization = function(authorizationId,ret){
  if(typeof MAIN_AUTHORIZATIONS[authorizationId] === 'function'){
    return MAIN_AUTHORIZATIONS[authorizationId](ret);
  } else {
    return MAIN_AUTHORIZATIONS[authorizationId];
  }
}, getOAuth1Tokens = function(authorizationId,ret){
  var ac = resolveAuthorization(authorizationId,ret);
  if(ac) ac = ac.authConfig;
  if(!ac) ac = {};
  return {
    consumer_key: ac.consumerKey || '',
    consumer_secret: ac.consumerSecret || '',
    token: ac.accessTokenKey || '',
    token_secret: ac.accessTokenSecret || ''
  }
};

var fireRequest = function(tc, trtc, timeout, callback){
  var toSend = { testcase : tc }, timeout = Math.floor(timeout);
  if(!(isNaN(timeout))){ toSend.timeout = timeout*1000; }
  runner(toSend,function(result){
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

var getActualResults = function(response) {
  return {
    statusCode : response.statusCode,
    headers : util.mapToArray(response.headers),
    content: util.stringify(response.body, null, true),
    resultType: getResultType(response)
  };
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
    var opts = { prefixes : ['',{}] }, jsonData = parseFromContentAndSet(result, '_'), tp;
    (tcVariables || []).forEach(function(vr){
      if(vr.name && vr.path && vr.type === 'json'){
        if(vr.path.indexOf(config.meta.startVarExpr) === 0 && vr.path.indexOf(config.meta.endVarExpr) !== -1){
          opts.prefixes[0] = result.content;
          opts.prefixes[1].headers = headers;
          opts.prefixes[1].statusCode = result.statusCode;
          VARS[vr.name] = ReplaceModule.replace(vr.path,opts);
        } else {
          VARS[vr.name] = getJSONPathValue(jsonData, vr.path, result.resultType);
        }
      }
    });
  }
  return;
};

var findExAndAc = function(headersMap, ass, actualResults, executionTime){
  if(util.v_asserts.shouldAddProperty(ass.name)) {
    ass.property = processUtil.replacingString(ass.property, publicConfiguration);
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
    case 'xmlBody' :
      return {
        ac : getJSONPathValue(actualResults._parsedContent, ass.property,
            ass.name === 'xmlBody' ? actualResults.resultType : false), ex : ass.value,
        setActual : (typeof actualResults._parsedContent === 'object') ?
                  (config.meta.copyFromActual+'json') : false
      };
    default :
      return {};
  }
};

var initForValidator = function(headersMap, runnerModel, applyToValidator, tc){ //tc added
  if(applyToValidator.length) return;
  var actualResults = runnerModel.result,
    toSendTC = _.extend(tc.lastSend, { expectedResults : (tc.getTc('expectedResults',true)) }),
    toSendTRTC = { headers : headersMap },
    jsonSchema = (tc.expectedResults && tc.expectedResults.contentSchema) || '{}';
  toSendTC.expectedResults.contentSchema = getJsonOrString(jsonSchema);
  parseFromContentAndSet(toSendTC.expectedResults, '_');
  toSendTRTC.actualResults = actualResults;
  setFinalExpContent(toSendTC.expectedResults, toSendTRTC.actualResults);
  applyToValidator.push(toSendTC, toSendTRTC, ReplaceModule.getFuncs());
  runnerModel.expectedResults = toSendTC.expectedResults;
};


var setFinalExpContent = function(er,ar){
  var toSet = false;
  if(util.isWithVars(er.content)){
    var spcl = START_VAR_EXPR + '*' + END_VAR_EXPR;
    toSet = true;
    if(er.content === spcl) {
      er.content = ar.content;
    } else if(er.resultType === 'json' || er.resultType === 'xml') {
      var spclIn = er.content.indexOf(spcl), isSpcl = true;
      var erj = parseFromContentAndSet(er, false, true);
      var arj = parseFromContentAndSet(ar, false);
      if(typeof erj === 'object' && isSpcl){
        util.mergeObjects(erj, arj, { spcl : spcl });
      }
      if(er.resultType === 'json'){
        er.content = util.stringify(erj);
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
  meta.assertTypes.xmlBody = util.cloneObject(meta.assertTypes.jsonBody);
  meta.assertTypes.xmlBody.name = 'XML Body';
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
  var findEx = findExAndAc.bind(undefined, headers),
    applyToValidator = [], initForVal = initForValidator.bind(undefined, headers),
    ret = [], asserting = assert.bind(undefined, validatorIdCodeMap);
  (tc.getTc('assertions') || []).forEach(function(ass){
    if(ass.id){
      var now = false;
      if(isValAss(ass)) {
        if(util.getModelVal(ass, 'type') === config.meta.schemaValidatorId) {
          findAndCacheTheSchemas();
        };
        var erm = tc.expectedResults;
        if(!(erm.hasOwnProperty('parsedContent'))){
          initForVal(runnerModel, applyToValidator, tc);
        }
        now = asserting(ass, { forValidator : applyToValidator });
      } else {
        now = asserting(ass, findEx(ass, actualResults, runnerModel.executionTime));
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

function fixFilePath(that,add){
  if(!that.filePath) {
    that.filePath = pathUtil.resolve('vrest_logs','logs') + '.' + add;
  }
}

function vRunner(opts){
  initAll();
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
  switch(this.logger){
    case 'xunit':fixFilePath(this,'xml');require('./logger/xunit')({ runner:this });break;
    case 'csv':fixFilePath(this,this.logger);require('./logger/csv')({ runner:this });break;
    case 'json':fixFilePath(this,this.logger);require('./logger/json')({ runner:this });break;
    default:require('./logger/console')({ runner:this });break;
  }
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
  this.totalRecords = 0; this.noPassed = 0; this.noFailed =0; this.noNotExecuted = 0; this.notRunnable = 0;
  var self = this;
  if(opts.exitOnDone !== false) {
    process.on( 'SIGINT', function() {
      self.emit('log',"\nPlease wait, Stopping test case execution ...");
      self.stopped = true;
      self.kill();
      runner.ABORT();
    });
  }
};

var setupLoopAlgo = function(runModelIndex, noUpdate){
  var runModel = MAIN_COLLECTION[runModelIndex];
  if(runModel && runModel.canHook === true){
    var tsId = runModel.testSuiteId;
    var lp = LOOPS.filter(function(lp){ return lp.endTCId === runModel.id && lp.testSuiteId === tsId; })[0];
    if(lp){
      var lpStart = lp.startTCId, nIndex = findLastTcWithId(runModelIndex,lpStart);
      if(typeof nIndex === 'number'){
        var stMod = MAIN_COLLECTION[nIndex];
        if(stMod && tsId === stMod.testSuiteId){
          var lps = this.shouldLoop(lp, noUpdate);
          if(lps === 0){
            runModel.condition = config.invalidLpCond;
            return false;
          } else if((!(noUpdate)) && nIndex !== -1 && nIndex <= runModelIndex && lps){
            this.totalRecords = this.totalRecords + runModelIndex - nIndex + 1;
            (VARS.$)++;
            return nIndex;
          }
        }
      }
    }
  }
};

var returnFalseLoop = function(lp, inLimits, noUpdate){
  if(!noUpdate) { VARS.$ = 0; }
  return (lp.maxCount === 0) ? 0 : false;
};

var shouldLoop = function(lp, noUpdate){
  var inLimits = (VARS.$ < (LOOP_LIMIT));
  if(typeof lp.maxCount !== 'number' || isNaN(lp.maxCount)){
    var isNN = true, src = processUtil.replacingString(lp.source);
    if(src === true){ return inLimits; }
    var nm = src;
    if(typeof src === 'string' || typeof src === 'number'){
      nm = Math.floor(src); isNN = isNaN(nm);
    }
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
    if(lp.maxCount === false) {
      if(processUtil.isConditionPassed(src,false) === true) {
        return inLimits;
      } else {
        lp.maxCount = 0;
        return returnFalseLoop(lp, inLimits, noUpdate);
      }
    }
  }
  if(inLimits && (typeof lp.maxCount === 'number' && lp.maxCount > ((VARS.$)+1))){
    return true;
  } else {
    return returnFalseLoop(lp, inLimits, noUpdate);
  }
};

_.extend(vRunner.prototype, events.EventEmitter.prototype);

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

vRunner.prototype.forOneTc = forOneTc;

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
    var tcy = 0;
    var checkExit = function(){
      if(SAVING_RESULTS){
        if(tcy > 1000){
          self.emit('warning', 'Test run results could not be saved ... TIMEOUT');
        } else {
          tcy++;
          console.log('Please wait while test run results being saved ...');
          return;
        }
      }
      clearInterval(checkExit);
      if(error) self.emit('end',error);
      else if(err || !body || body.error) self.emit('end',['Error while saving report : ', err||body]);
      else self.emit('end',null, body.output.statistics, body.output.remarks);
    };
    setInterval(checkExit, 1000);
  });
};

var findAndCacheTheSchemas = function(){
  if(Array.isArray(JSONSchemasRefs)) {
    var schemaMap = {};
    JSONSchemasRefs.forEach(function(sch) {
      try {
        schemaMap[util.getModelVal(sch, 'name')] = JSON.parse(util.getModelVal(sch, 'content'));
      } catch (er) {
      }
    });
    JSONSchemasRefs = schemaMap;
  }
};

vRunner.prototype.kill = function(){
  var self = this;
  self.sendToServer('OVER');
  var ne = (self.totalRecords-self.noPassed-self.noFailed-self.noNotExecuted-self.notRunnable);
  self.sendToServer(ne);
  self.saveReport(null,self.instanceURL + '/g/testrun/'+self.testRunId, {
    total : self.totalRecords, passed : self.noPassed, notRunnable : self.notRunnable,
    failed : self.noFailed, notExecuted : ne + self.noNotExecuted
  }, function(err){
    if(err) self.emit('warning',err);
    self.emit('log',"\nTest Run Stopped.");
    if(self.exitOnDone) process.exit(1);
    else self.emit('handle_the_exit', 1);
  }, true);
};

vRunner.prototype.sigIn = function(next){
  this.emit('log', 'Logging you in ...');
  request({ method: 'POST', uri: V_BASE_URL + 'user/signin', body: this.credentials }, function(err,res,body){
    if(err || !body || body.error) next("Error while logging into vREST.\n" + util.stringify(err||body), 'VRUN_OVER');
    else next(null,body);
  });
};

vRunner.prototype.sendToServer = HookRunner.prototype.sendToServer;

vRunner.prototype.afterComplete = function(report){
  var rmk = false;
  if((typeof this.stopped === 'string' && this.stopped)) {
    rmk = this.stopped;
  } else if(this.stopped === true) {
    rmk = 'Execution stopped by user.';
  }
  if(!VARS.$tr) VARS.$tr = {};
  VARS.$tr.result = {
    totalCount : report.total,
    failedCount : report.failed,
    passedCount : report.passed,
    notExecutedCount : report.notExecuted,
    notRunnableCount : report.notRunnable,
    remarks : rmk || '',
    resultLink : (this.instanceURL+'/'+this.projectKey+'/testcase') + '?testRunId='+this.testRunId
  };
  this.emit('after-post-run',VARS.$tr);
  if(PSTR_HOOK_RUNNER){
    callOneQ(PSTR_HOOK_RUNNER,PSTR_HOOK_COL,function(){});
  }
};

var getFullName = function(usr){
  var nm = usr.firstName;
  if(usr.lastName) nm += (' '+usr.lastName);
  return nm;
};

vRunner.prototype.run = function(next){
  var self = this, report = { total : 0, passed : 0, failed : 0, notExecuted : 0, notRunnable : 0 };
  var tasks = [
    function(cb){
      self.sigIn(cb);
    },
    function(cb){
      self.emit('log', 'Checking permission to execute test cases in project ...');
      hasRunPermission(self.instanceName,self.projectId,function(err,projectKey, prefetch, proju,usr){
        if(err) cb(err);
        else {
          self.userFullName = getFullName(usr);
          self.stopUponFirstFailureInTestRun = Boolean(proju.action && proju.action.stopUponFirstFailureInTestRun);
          if(!self.timeout){
            var to = Math.floor(proju.action && proju.action.respTimeout);
            if(!(isNaN(to)) && to && to < RUNNER_LIMIT){ self.timeout = to; }
          }
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
      findHelpers(self, 'testsuite', function(err,records){
        if(err) cb(err, 'VRUN_OVER');
        else {
          var testSuiteMap = {};
          if(Array.isArray(records)){
            for(var k=0;k<records.length;k++){
              testSuiteMap[records[k].id] = records[k].name;
            }
          }
          self.emit('testsuites',testSuiteMap);
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
      findHelpers(self, 'jsonschema', function(err,jss){
        if(err) cb(err, 'VRUN_OVER');
        else {
          JSONSchemasRefs = jss;
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
            delete bv.id;
            if(!(_.isEmpty(JSONSchemasRefs))) {
              bv.definitions = _.extend({},JSONSchemasRefs,bv.definitions);
            }
            if(ifDraft03(bv)){
              var result = sk.draft03Validator(av,bv);
              if(!result) return false;
              bv.vrest_schemaErrors = result.errors || [];
              return result.valid;
            } else {
              try {
                return ZSV.validate.call(ZSV,av,bv);
              } catch(erm){
                console.log(erm);
                return false;
              }
            }
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
              if(self.exitOnDone) process.exit(1);
              else self.emit('handle_the_exit', 1);
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
          processUtil.configureVarCol(vars, {});
          if(self.selectedEnvironment){
            processUtil.configureVarCol(vars, { selectedEnvironment : self.selectedEnvironment, dontClear : true });
          }
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
          self.testRunCreatedAt = String(testrun.createdAt);
          self.emit('testrun',testrun);
          cb();
        }
      });
    },
    function(cb){
      fetchAndServe(self.url, self.pageSize, self.forOneTc.bind(self,report), cb, self);
    }
  ];
  util.series(tasks,function(err, data){
    self.afterComplete(report);
    if(err) self.emit('error',err);
    if(data === 'VRUN_OVER') return;
    self.sendToServer('OVER');
    self.emit('log', 'Saving test run execution report ...');
    self.saveReport(err,self.instanceURL + '/g/testrun/'+self.testRunId,report,next);
  });
};

module.exports = vRunner;
