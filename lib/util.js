var fs = require('fs'),
    mkdirp = require('mkdirp'),
    path = require('path'),
    ReplaceModule = require('./replacingStrings'),
    mainUrl = require('url'),
    config = {};

var START_VAR_EXPR = '{{', END_VAR_EXPR = '}}';
var BinaryRegex = /[\x00-\x1F\x80-\xFF]/, MAX_LENGTH_STR = 500000;

// Changes XML to JSON, https://davidwalsh.name/convert-xml-json
function xmlToJson(withStar, xml) {
  var XML_STAR_VAR = "__STAR_VAR__", XML_EQUAL_TO = '{{*}}';
  
  var getTextContent = function(str){
    return str.trim();
  };

  var isValidXMLStar = function(withStar, vl){
    return withStar && vl && (vl.trim() === XML_STAR_VAR);
  };

  var replaceXMLStar = function(withStar, str){
    if(isValidXMLStar(withStar, str)){
      return XML_EQUAL_TO;
    } else {
      return str;
    }
  };

  // Create the return object
  var obj = {};

  if (xml.nodeType == 1) { // element
    // do attributes
    obj["@attributes"] = {};
    if (xml.attributes.length > 0) {
      for (var j = 0; j < xml.attributes.length; j++) {
        var attribute = xml.attributes.item(j);
        var attrName = replaceXMLStar(withStar, attribute.nodeName);
        obj["@attributes"][attrName] = replaceXMLStar(withStar, attribute.nodeValue);
      }
    }
  } else if (xml.nodeType == 3) { // text
    obj = getTextContent(xml.nodeValue);
  } else if (xml.nodeType == 4) { // text
    return xml.textContent;
  }

  // do children
  if (xml.hasChildNodes && xml.hasChildNodes()) {
    for(var i = 0; i < xml.childNodes.length; i++) {
      var item = xml.childNodes.item(i);
      var nodeName = item.nodeName;
      if(isValidXMLStar(withStar, nodeName)){
        obj[XML_EQUAL_TO] = XML_EQUAL_TO;
      } else {
        if (typeof(obj[nodeName]) == "undefined") {
          obj[nodeName] = xmlToJson(withStar, item);
        } else if(nodeName !== '#text'){
          if (typeof(obj[nodeName].push) == "undefined") {
            var old = obj[nodeName];
            obj[nodeName] = [];
            obj[nodeName].push(old);
          }
          obj[nodeName].push(xmlToJson(withStar, item));
        }  
      }
    }
  }
  if(obj['#text'] && typeof obj['#text'] === 'string' && isValidXMLStar(withStar, obj['#text'])){
    obj['#text'] = XML_EQUAL_TO;
  }
  return obj;
}

module.exports = {

  writeToFile : function(file,data) {
    mkdirp.sync(path.dirname(file));
    fs.writeFileSync(file, data);
  },

  isObject : function(obj, allowEmpty, allowArrray, allowNull){
    return ((typeof obj === 'object') && (allowNull || obj) &&
        (allowArrray || !Array.isArray(obj)) && (allowEmpty || Object.keys(obj).length));
  },

  validateObj : function(obj, file){
    if(!obj || typeof obj !== 'object') return 'Object to validate not found';
    if(Array.isArray(obj)){ return 'Object to validate shoud not be an array'; }
    for(var k in file){
      if(file[k]){
        if(typeof file[k] === 'string') file[k] = { type : file[k] };
        if(!obj.hasOwnProperty(k)) {
          if(file[k].notReq === true) return false;
          else return k + ' not found..!';
        }
        switch(file[k].type){
          case 'number' :
            if(typeof obj[k] !== 'number') return k + ' should be a number';
            if(typeof file[k].min === 'number' && obj[k] < file[k].min)
              return k + ' should be greater than '+file[k].min;
            if(typeof file[k].max === 'number' && obj[k] > file[k].max)
              return k + ' should be less than '+file[k].max;
            break;
          case 'boolean' :
            if(typeof obj[k] !== 'boolean') return k + ' should be true or false';
            if(typeof file[k].bool === 'boolean' && obj[k] !== file[k].bool) return k + ' should be '+file[k].bool;
            break;
          case 'array' :
            if(!Array.isArray(obj[k])) return k + ' shoule be an array.';
            if(typeof file[k].length === 'number' && obj[k].length !== file[k].length)
              return k + ' should have ' + file[k].length + ' records';
            if(typeof file[k].min === 'number' && file[k].length < file[k].min)
              return k + ' k should have greater than '+file[k].min + ' records';
            if(typeof file[k].max === 'number' && file[k].length > file[k].max)
              return k + ' keys should have less than '+file[k].max + ' records.';
            break;
          case 'object' :
            if(typeof obj[k] !== 'object') return k + ' should be a object';
            if(typeof file[k].length === 'number' && Object.keys(obj[k]).length !== file[k].length)
              return k + ' should have '+file[k].length + ' properties';
            var kl = Object.keys(obj[k]).length;
            if(typeof file[k].min === 'number' && kl < file[k].min)
              return k + ' keys length should be greater than '+file[k].min;
            if(typeof file[k].max === 'number' && kl > file[k].max)
              return k + ' keys length should be less than '+file[k].max;
            break;
          default :
            if(typeof obj[k] !== 'string') return k + ' should be a string';
            if(typeof file[k].length === 'number' && obj[k] !== file[k].length)
              return k + ' should be of length '+file[k].length;
            if(typeof file[k].min === 'number' && obj[k].length < file[k].min)
              return k+' length should be greater than '+file[k].min;
            if(typeof file[k].max === 'number' && obj[k].length > file[k].max)
              return k +' length should be less than '+file[k].max;
            if(typeof file[k].exact === 'string' && obj[k] !== file[k]) return k + ' must match '+file[k].max;
            if(file[k].regex && !file[k].regex.test(obj[k])) return k + ' should pass regex '+String(file[k].regex);
        }
      }
    }
    return false;
  },

  isWithVars : ReplaceModule.isWithVars,

  cropString : function(str, leng){
    if(typeof str != 'string' || !leng || str.length <= leng) return str;
    return str.substring(0, leng-3) + '...';
  },

  insideObject : function (obj1, obj2, opts){
    var bKeys = Object.keys(obj2), i, count, key;

    for(i = 0, count = bKeys.length; i < count; i++) {
      key = bKeys[i];
      if(obj1.hasOwnProperty(key)){ //obj1 contains the key
        obj1[key] = this.mergeObjects(obj1[key], obj2[key], opts);
      } else if(obj1.hasOwnProperty(opts.spcl)){ //obj1 doesn't contains the key, but contains the special variable as key
        if(obj1[opts.spcl] === opts.spcl){ //if value of special variable key is also spcial variable
          obj1[key] = obj2[key]; //then copy the actual response to expected response
        } else {
          obj1[key] = obj1[opts.spcl]; // else copy the value from expected body which is having key as special variable
        }
      } // else we do nothing.
    }
    if(obj1.hasOwnProperty(opts.spcl)) delete obj1[opts.spcl];
    return obj1;
  },

  insideArray : function (arr1, arr2, opts){
    var len1 = arr1.length, len2 = arr2.length;
    var len = len1;
    if(len > len2) len = len2;

    var i, count;
    for(i = 0, count = len; i < count; i++){
      if(arr1[i] !== arr2[i]){
        arr1[i] = this.mergeObjects(arr1[i], arr2[i], opts);
      }
    }
    return arr1;
  },

  getRegExp: function(pattern){
    var lastSlashIndex = pattern.lastIndexOf('/'),
      modifiers = "";
    if(lastSlashIndex < (pattern.length - 1)){
      modifiers = pattern.slice(lastSlashIndex + 1);
      pattern = pattern.slice(0, lastSlashIndex + 1);
    }
    return new RegExp(pattern.slice(1, pattern.length -1), modifiers);
  },

  mergeObjects : function(obj1, obj2, opts){
    if(obj1 && obj1[opts.spcl] && opts.forXML){
      for(var key in obj1){
        if(typeof obj1[key] === 'object' && typeof obj2[key] === 'object'){
          if(!Array.isArray(obj1[key]) && Array.isArray(obj2[key])){
             obj1[key] = [obj1[key]];
          }

          if(Array.isArray(obj1[key]) && Array.isArray(obj2[key]) && obj2[key].length > obj1[key].length){
            for(var i = obj1[key].length; i < obj2[key].length; i++){
              obj1[key].push(obj1[opts.spcl]);
            }
          }
        }
      }
    }
    if(opts.spcl === obj1) return obj2;
    if(typeof obj1 === 'string' && typeof obj2 === 'string'
        && obj1.indexOf(opts.startVarExpr + '/') === 0
        && (obj1.indexOf(opts.endVarExpr) === (obj1.length - opts.endVarExpr.length))){
      var pattern = obj1.slice(opts.startVarExpr.length, - opts.endVarExpr.length);
      try {
        if(new RegExp(this.getRegExp(pattern)).test(obj2) === true){
          return obj2;
        }  
      } catch(ex){
        console.log(ex);
      }
    }
    if(typeof(obj1) != 'object' || typeof(obj2) != 'object' || !obj1 || !obj2){
      return obj1;
    }
    if(typeof opts !== 'object' || !opts) opts = {};

    var isArrayA = Array.isArray(obj1);
    var isArrayB = Array.isArray(obj2);
    if(isArrayA && isArrayB) {
      return this.insideArray(obj1, obj2, opts);
    } else if((!isArrayA && isArrayB) || (isArrayA && !isArrayB)){
      return obj1;
    } else {
      var output = this.insideObject(obj1, obj2, opts);
      return output;
    }
  },

  parseObject : ReplaceModule.getJsonOrString,

  arrayToMap : function(ar, ky, vl){
    var ac = {};
    if(Array.isArray(ar)){
      ar.forEach(function(ab){ ac[ab[ky]] = ab[vl]; });
    }
    return ac;
  },

  getModelVal : function(m,a){
    return (typeof m.get == 'function' ? m.get(a) : m[a]);
  },

  recForEach : function(args){
    var ar = args.ar, ec = args.ec, cb = args.cb, ah = args.finishOnError;
    if(ah !== false) ah = true;
    if(Array.isArray(ar)){
      var err = null;
      var forEachAr = function(z){
        if(z === ar.length) return cb(err);
        else {
          ec(ar[z], function(errr){
            if(errr && ah === true) return cb(errr);
            else {
              err = errr;
              forEachAr(z+1);
            }
          },z);
        }
      };
      forEachAr(0);
    } else return cb(true);
  },

  series : function(ar,cb,ah) {
    if(ah !== false) ah = true;
    if(Array.isArray(ar)){
      var err = null;
      var forEachAr = function(z){
        if(z === ar.length) return cb(err);
        else {
          ar[z](function(errr, data){
            if(errr && ah === true) return cb(errr,data);
            else {
              err = errr;
              forEachAr(z+1);
            }
          });
        }
      };
      forEachAr(0);
    } else return cb(true);
  },

  getReadableDate : function(date){
    if(!(date instanceof Date)) date = new Date(); var dstr = (date.toString());
    var ha = dstr.substring(16,17), hb = dstr.substring(17,18), hh = '', ps = 'am', hh = (Number(ha+hb)%12);;
    var ms = date.getMilliseconds(); if(ms < 10) ms = ('00'+ms); else if(ms < 100) ms = ('0'+ms);
    if(ha === '0') ha = '';
    else { if(ha === '1') { if(hb !== '1'){ ps = 'pm'; } } else ps = 'pm'; }
    return hh + dstr.substring(18,24)+'.'+ ms +
      ' ' + ps + ', ' + dstr.substring(4, 10) + ',' + dstr.substring(10, 15);
  },

  isString : function(str, allowEmpty){
    return ((typeof str === 'string') && (allowEmpty || str.length));
  },

  isFunction : function(func){
    return (typeof func === 'function');
  },

  isNumber : function(func){
    return (typeof func === 'number');
  },

  isFound : function(res, what){
    return this.isFunction(res[what]);
  },

  getStringToRender : function(contn,code){
    if(typeof contn !== 'string') return code ? 0 : contn;
    if(false && Boolean(contn.match(BinaryRegex))){
      return code ? 1 : 'SKIPPED_DUE_TO_NON_SUPPORTED_CHARS';
    } else if(contn.length > MAX_LENGTH_STR){
      return code ? 2 : 'SKIPPED_DUE_TO_LARGE_CONTENT';
    } else return code ? 3 : contn;
  },

  stringify : function(obj, pretty, notIfString){
    try {
      if(notIfString && typeof obj === 'string') return obj;
      if(pretty) return JSON.stringify(obj, null, pretty);
      else return JSON.stringify(obj);
    } catch(e) {
      return obj;
    }
  },

  isValidHTTPStatus : function(code){
    return (code > 99 && code < 599); // assumed that in this range, it will be HTTP status code
  },

  extractParamters : function(params) {
    var toReturn = { query : [], body: [] }
    params.forEach(function(param){
      if(param.method == 'body') {
        toReturn.body.push(param);
      } else if(param.method == 'query') {
        toReturn.query.push(param);
      }
    });
    return toReturn;
  },

  getString : function(input, args){
    if(this.isFunction(input)){
      var x = input.apply(input, args);
      if(this.isString(x)) return x;
      else return input;
    } else {
      return input;
    }
  },

  isURL : function(str){
    return (this.isString(str) && str.indexOf('http') === 0);
  },

  isEmpty : function(obj) {
    if (obj == null) return true;
    if (Array.isArray(obj) || typeof obj === 'string' || typeof obj.hasOwnProperty('callee')) return obj.length === 0;
    return typeof obj === 'object' ? (Object.keys(obj).length === 0) : false;
  },

  parseQuery : function(url, pushIn, ignoreSplit){
    if(!pushIn) pushIn = {};
    var parsedObj = mainUrl.parse(url, true);
    if(ignoreSplit) {
      return mainUrl.format({ protocol : parsedObj.protocol, host : parsedObj.host, pathname : parsedObj.pathname });
    }
    for(var ky in parsedObj.query){
      /*if(ky.slice('-2') === '[]'){
        var nk = ky.slice(0,-2);
        if(pushIn.hasOwnProperty(nk)){
          pushIn[nk].push(parsedObj.query[ky]);
        } else {
          pushIn[nk] = [parsedObj.query[ky]];
        }
      } else {
        pushIn[ky] = parsedObj.query[ky];
      }*/
      pushIn[ky] = parsedObj.query[ky];
    }
    return pushIn;
  },

  isJSONRequest: function(req){
    return req && ((/application\/json/.test(req.headers['accept'])) || (/application\/json/.test(req.headers['Accept'])));
  },

  isPlainRequest: function(req){
    return req && ((/text\/plain/.test(req.headers['accept'])) || (/text\/plain/.test(req.headers['Accept'])));
  },

  isHTMLRequest: function(req){
    if(!req) return false;
    var ac = req.headers['accept'] || req.headers['Accept'];
    return (ac && ac.indexOf('html') !== -1)
  },

  v_asserts : {
    assertTypeOpts : [],
    assertSubTypeOpts : { },
    shouldAddProperty : function(nm){
      return (['jsonBody', 'xmlBody', 'header'].indexOf(nm) !== -1);
    },
    shouldNotAddValue : function(nm,type,config){
      return ((nm === 'textBody' && config.meta.mongoIdRegex.test(type))
        || type === 'hasValue' || (type && type.indexOf('is') === 0));
    },
    _ : {}
  },

  capitalize : function(word){
    return word.charAt(0).toUpperCase() + word.substr(1);
  },

  unCamelCase : function(name) {
    var words = name.match(/[A-Za-z][a-z]*/g);
    return this.capitalize(words.join(" ").toLowerCase());
  },

  isXMLRequest: function(req){
    if(!req) return false;
    var ac = req.headers['accept'] || req.headers['Accept'];
    return (/application\/xml/.test(ac));
  },

  mapToArray : function(mp, key, value, deep){
    if(!key) key = 'name';
    if(!value) value = 'value';
    var ar = [];
    for(var k in mp){
      var o = {};
      o[key] = k;
      o[value] = mp[k];
      ar.push(o);
    }
    return ar;
  },

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
  },

  walkInto : ReplaceModule.walkInto,

  cloneObject : function(obj){
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (e){
      return false;
    }
  },

  xmlToJson : xmlToJson.bind(null, false),
  starXmlToJson : xmlToJson.bind(null, true)
};
