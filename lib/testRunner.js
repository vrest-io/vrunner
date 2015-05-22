var request = require('request');

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

  var i, count, method = tc.method,
    url = tc.url,
    headers = {},
    saveHeaders = {},
    params = tc.params;

  if(tc.headers && tc.headers.length > 0){
    for(i = 0, count = tc.headers.length; i < count; i++){
      if(tc.headers[i].name){
        headers[tc.headers[i].name] = tc.headers[i].value;
      }
    }
  }

  if(tc.authorizationHeader){
    headers["authorization"] = tc.authorizationHeader;
  }

  headers['x-powered-by'] = 'vREST';
  headers['x-vrest-testcaseId'] = tc.id;

  var options = {
    url: url,
    method: method,
    headers: headers
  };
  var body = null;
  if(tc.raw && tc.raw.resultType == 'text' && tc.raw.content && tc.raw.enabled === true) var xbody = tc.raw.content;
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

  for(var key in options.headers){
    saveHeaders[key] = options.headers[key];
  }

  if(body){
    options.body = body;
  }
  request(options, function(err, response){
    var result = {
      body: response.body,
      response: response.response,
      responseHeaders: response.responseHeaders,
      responseText: response.responseText,
      status: response.status,
      statusCode: response.statusCode
    };
    callback({err: err, response: result});
  });
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

module.exports = runTestCase;
