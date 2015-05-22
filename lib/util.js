module.exports = {
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

  funcVarReplace : function(mts, opt, mtsmap, methodCodes){
    if(Array.isArray(mts)){
      mts.forEach(function(y){
        var arIndex = y.indexOf('('), brIndex = y.indexOf(')');
        if(arIndex != -1 && brIndex != -1){
          var funp = y.substring(opt.startVarExpr.length, arIndex).trim();
          var ky = funp + '\\(';
          var cd = methodCodes[funp];
          if(cd && ['compareJSON','validateJSONSchema', 'lastSchemaErrors'].indexOf(cd) === -1){
            var subs = y.substring(arIndex+1,brIndex);
            ky += (subs + '\\)');
            subs = subs.trim();
            if(subs){
              subs = subs.split(',');
              if(subs.length){
                var ar = [];
                for(var z = 0; z < subs.length; z++){
                  subs[z] = subs[z].trim();
                  var eg = subs[z].charAt(0);
                  var fg = subs[z].charAt(subs[z].length - 1);
                  if(eg === fg && (eg === '"' || eg === "'"))
                    subs[z] = "\"" + subs[z].substring(1, subs[z].length - 1) + "\"";
                  try { ar.push(JSON.parse(subs[z])); } catch(b){ }
                }
                mtsmap[ky] = cd.apply(this, ar);
              }
            } else mtsmap[ky] = cd();
          }
        }
      });
    }
  },

  insideObject : function (obj1, obj2, mergeIf){
    var aKeys = Object.keys(obj1).sort(), bKeys = Object.keys(obj2).sort(), i, count;
    if(aKeys.length !== bKeys.length) return obj1;
    for(i = 0, count = aKeys.length; i < count; i++) {
      if(aKeys[i] !== bKeys[i]){
        return obj1;
      } else if(mergeIf(obj1[aKeys[i]])){
        obj1[aKeys[i]] = obj2[aKeys[i]];
      } else {
        obj1[aKeys[i]] = this.mergeObjects(obj1[aKeys[i]], obj2[aKeys[i]]);
      }
    }
    return obj1;
  },

  insideArray : function (arr1, arr2, mergeIf){
    if(arr1.length === arr2.length){
      var i, count;
      for(i = 0, count = arr1.length; i < count; i++){
        if(arr1[i] !== arr2[i]){
          arr1[i] = this.mergeObjects(arr1[i], arr2[i], mergeIf);
        }
      }
    }
    return arr1;
  },

  mergeObjects : function(obj1,obj2,mergeIf){
    if(typeof(obj1) != 'object' || typeof(obj2) != 'object' || typeof mergeIf !== 'function' || !obj1 || !obj2){
      return obj1;
    }

    var isArrayA = Array.isArray(obj1);
    var isArrayB = Array.isArray(obj2);
    if(isArrayA && isArrayB) {
      return this.insideArray(obj1, obj2, mergeIf);
    } else if((!isArrayA && isArrayB) || (isArrayA && !isArrayB)){
      return obj1;
    } else {
      return this.insideObject(obj1, obj2, mergeIf);
    }
  },

  searchAndReplaceString : function(str, collection, opt) {
    if(!str) return str;
    var start = opt.startVarExpr, end = opt.endVarExpr, reg;
    if(!collection) return str;
    for(var k in collection){
      reg = new RegExp(start + k + end,'g');
      str = str.replace(reg, String(collection[k]));
    }
    return str;
  },

  getMatches : function(str, regex) {
    var reg = new RegExp(regex, 'g');
    var matches = str.match(reg);
    return matches;
  },

  preProcessForSearchAndReplace: function(tc, opt, variables) {
    var self = this;
    var getModelVal = function(m,a){
      return m[a];
    };

    //for variable search and replace
    var replacingString = function(st) {
      self.funcVarReplace(self.getMatches(st, (opt.startVarExpr + '.*?\\(.*?\\)' + opt.endVarExpr)), opt, variables);
      return self.searchAndReplaceString(st, variables, opt, 'key', 'value');
    };
    //local variables extracted from API requests
    var key;

    if(typeof variables != 'object' && !variables) variables = {};

    if(tc.params){
      tc.params.forEach(function(v){
        if(v.id){
          v.value = replacingString(v.value || '');
          if(v.method === 'path') {
            //path variables will overwrite previously defined variables
            variables[getModelVal(v, 'name')] = getModelVal(v, 'value');
          }
        }
      });
    }

    var startVarExpr = opt.startVarExpr, endVarExpr = opt.endVarExpr;
    return this.preProcessTestCase(tc, replacingString);
  },

  preProcessTestCase : function(tc, replacingString) {
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
    return tc;
  },

  recForEach : function(args,func){
    var ar = args.ar, ec = args.ec, cb = args.cb, ah = args.finishOnError;
    if(ah !== false) ah = true;
    if(Array.isArray(ar)){
      var err = null;
      var onEach = function(errr){
        if(errr && ah === true) return cb(errr);
        else {
          err = errr;
          forEachAr(z+1);
        }
      };
      var forEachAr = function(z){
        if(z === ar.length) return cb(err);
        else if(func) ar[z](onEach);
        else ec(ar[z], onEach, z);
      };
      forEachAr(0);
    } else return cb(true);
  },

  getReadableDate : function(date){
    if(!(date instanceof Date)) date = new Date(date);
    data = data.toJSON();
    return dj.substring(5,7) + '/'+ dj.substring(8,10) + '/' + dj.substring(0,4);
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

  stringify : function(obj, pretty){
    try {
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
    var fr = url.indexOf("#"), qs = url, toSendUrl = url, index = url.indexOf("?");
    if(index != -1){
      toSendUrl = url.substr(0, index);
      qs = url.substr(index + 1);
    }
    if(ignoreSplit === true) return toSendUrl;
    if(fr != -1) qs = qs.substr(0, fr);
    var parts = qs.split("&"), p, v;
    for(var i = 0; i < parts.length; i++){
      p = parts[i].split("=");
      if(p.length === 2){
        pushIn[p[0]] = p[1];
      }
    }
    return pushIn;
  },

  beautifyURL: function(base,url){
    if(!this.isURL(url)) url = base + (url.charAt(0) === '/' ? url.substring(1,url.length) : url);
    if(url.charAt(url.length-1) === '/') url = url.substring(0,url.length-1);
    if(url.indexOf('?') === '-1') url = url + '?';
    else if(url.charAt(url.length-1) === '&') url = url.substring(0,url.length-1);
    return url;
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
    try {
      return JSON.parse(str);
    } catch(err){
      return str;
    }
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
      o[value] = deep ? v[deep] : v;
      ar.push(o);
    }
    return ar;
  },

  completeURL: function(url, params) {
    var s = null;
    if(!params || !_.isArray(params)) return url;
    params.forEach(function(pm){
      if(pm.toJSON) pm = pm.toJSON();
      if(pm.method == 'query' && pm.name && pm.name.length) {
        if(!s) s = '?' + pm.name + '=' + (pm.value || '');
        else s += '&' + pm.name + '=' + (pm.value || '');
      }
    });
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
