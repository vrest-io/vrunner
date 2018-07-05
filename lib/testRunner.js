var request = require('request');

var CURRENT_REQUEST = null;
var url_encode = function(params){
  var encoded = '', i, count;
  for(i = 0, count = params.length; i < count; i++){
    if(params[i].method == 'body' && params[i].name.length) {
      if(encoded.length)  encoded += '&';
      encoded += encodeURIComponent(params[i].name) + '=' + encodeURIComponent(params[i].value);
    }
  }
  return encoded;
};

var isNumber = function(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
};

var parseBoolean = function(val) {
  if(val === 'true') return true;
  else if(val === 'false') return false;
  else return val;
};

var parseObject = function(val) {
  try {
    return JSON.parse(val);
  } catch(e) {
    return val;
  }
};

var json_encode = function(params){
  var encoded = {};
  for(i = 0, count = params.length; i < count; i++){
    var key = params[i].name;
    var val = params[i].value;
    if(params[i].method == 'body' && key.length) {
      var type = params[i].paramType;
      if(type == 'number') encoded[key] = isNumber(val) ? parseFloat(val) : val;
      else if(type == 'boolean') encoded[key] = parseBoolean(val);
      else if(type == 'object') encoded[key] = parseObject(val);
      else encoded[key] = val;
    }
  }
  return JSON.stringify(encoded);
};

var runTestCase = function(oArgs, callback){
  var tc = oArgs.testcase;
  var runnerJar = oArgs.jar;

  var i, count, method = tc.method,
    url = tc.url,
    headers = {},
    params = tc.params;
  var hasCookieHeader = false;
  if(tc.headers && tc.headers.length > 0){
    for(i = 0, count = tc.headers.length; i < count; i++){
      if(tc.headers[i].name){
        headers[tc.headers[i].name] = tc.headers[i].value;
        if(tc.headers[i].name.toLowerCase() === "cookie"){
          hasCookieHeader = true;
        }
      }
    }
  }

  if(tc.authorizationHeader){
    headers["authorization"] = tc.authorizationHeader;
  }

  headers['x-powered-by'] = 'vREST';
  headers['x-vrest-testcaseId'] = tc.id;

  if(hasCookieHeader){
    runnerJar = null;
  }
  
  var options = {
    followAllRedirects: true,
    url: url,
    method: method,
    headers: headers,
    jar: runnerJar
  };
  if(typeof oArgs.timeout === 'number'){
    options.timeout = oArgs.timeout;
  }
  var body = null;
  if(tc.raw && tc.raw.content && tc.raw.enabled === true) var xbody = tc.raw.content;
  if((['POST', 'PATCH', 'PUT', 'DELETE'].indexOf(method) != -1) && ((params && params.length > 0) || xbody)) {
    var contentType = null;
    if(headers['Content-Type'] || headers['content-type']) contentType = headers['Content-Type'] || headers['content-type'];

    if(xbody) {
      body = xbody;
      if(!contentType){ try { JSON.parse(body); options.headers['Content-Type'] = 'application/json'; } catch(e){} }
    } else if(contentType && contentType.indexOf("json") != -1) body = json_encode(tc.params);
    else {
      options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = url_encode(tc.params);
    }
  }

  if(body){
    options.body = body;
  }
  var afterRes = function(err, response, body){
    var result = {};
    if(response){
      result.body = body;
      result.headers = response.headers;
      result.statusCode = response.statusCode;
    }
    delete options.followAllRedirects;
    callback({err: err, response: result, runnerCase : options});
  };
  CURRENT_REQUEST = request(options, afterRes);
  CURRENT_REQUEST.on("request", function(){
    options.headers = JSON.parse(JSON.stringify(this.headers));
  })
  return true;
};

var getHeaderValue = function(headerName, headers){
  var i, count;
  for(i = 0, count = headers.length; i < count; i++){
    if(headers[i].name === headerName){
      return headers[i].value;
    }
  }
  return null;
};

runTestCase.ABORT = function(){
  if(CURRENT_REQUEST && typeof CURRENT_REQUEST.abort === 'function'){
    CURRENT_REQUEST.abort();
    CURRENT_REQUEST = null;
  }
};

module.exports = runTestCase;
