var fs = require('fs'),
    mkdirp = require('mkdirp'),
    path = require('path'),
    mainUrl = require('url'),
    config = {};

var START_VAR_EXPR = '{{', END_VAR_EXPR = '}}';

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

  isWithVars : function(st){
    if(st && typeof st === 'string' && st.length > (END_VAR_EXPR.length+START_VAR_EXPR.length)) {
      var f = st.indexOf(START_VAR_EXPR), l = st.indexOf(END_VAR_EXPR);
      return (f !== -1 && l !== -1);
    } else return false;
  },

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

  mergeObjects : function(obj1, obj2, opts){
    if(opts.spcl === obj1) return obj2;
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
    if(!(date instanceof Date)) date = new Date(); date = String(date);
    var ha = date.substring(16,17), hb = date.substring(17,18), hh = '', ps = 'am', hh = (Number(ha+hb)%12);;
    if(ha === '0') ha = '';
    else { if(ha === '1') { if(hb !== '1'){ ps = 'pm'; } } else ps = 'pm'; }
    return hh + date.substring(18,24) + ' ' + ps + ', ' + date.substring(4, 10) + ',' + date.substring(10, 15);
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

  parseQuery : function(url, pushIn, ignoreSplit){
    if(!pushIn) pushIn = {};
    var parsedObj = mainUrl.parse(url, true);
    if(ignoreSplit) {
      return mainUrl.format({ protocol : parsedObj.protocol, host : parsedObj.host, pathname : parsedObj.pathname });
    }
    for(var ky in parsedObj.query){
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

  v_asserts : {
    assertTypeOpts : [],
    assertSubTypeOpts : { },
    shouldAddProperty : function(nm){
      return (nm === 'jsonBody' || nm === 'header');
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

  walkInto : function(fun, root, obj, key){
    fun(obj, key, root);
    if(typeof obj === 'object' && obj){
      for(var k in obj){
        this.walkInto.bind(this, fun, obj)(obj[k], k);
      }
    }
  },

  completeURL: function(url, params) {
    var s = null, i = 0,l, pm;
    if(!params || typeof params !== 'object') return url;
    if(Array.isArray(params)){
      for(i=0,l=params.length;i<l;i++){
        pm = params[i];
        if(pm.toJSON) pm = pm.toJSON();
        if(pm.method == 'query' && pm.name && pm.name.length) {
          if(!s) s = '?' + pm.name + '=' + (pm.value || '');
          else s += '&' + pm.name + '=' + (pm.value || '');
        }
      }
    } else {
      for(i in params){
        pm = params[i];
        if(!s) s = '?' + i + '=' + (params[i] || '');
        else s += '&' + i + '=' + (params[i] || '');
      }
    }
    return url + (s || '');
  },

  cloneObject : function(obj){
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (e){
      return false;
    }
  }
};
