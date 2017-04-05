(function() {

  var V_DEBUG = console.log, isObject = function(obj) {
    var type = typeof obj;
    return type === 'function' || type === 'object' && !!obj;
  }, isString = function(str) {
    return (typeof str === 'string' && str);
  }, isFunction = function(str) {
    return (typeof str === 'function');
  }, copy = function(dest, src){
    if(!isObject(dest)) dest = {};
    if(!isObject(src)) return dest;
    for(var key in src){
      if(src.hasOwnProperty(key)){
        dest[key] = src[key];
      }
    }
    return dest;
  }, extractParameters = function(str, methodName){ // https://jsfiddle.net/jv0328tp/18/
    var ar = [];
    if(typeof str === 'string' && str.length){
      var chars = str.split(','), cl = chars.length;
      var pushInto = function(n){
        chars[n] = chars[n].trim();
        var len = chars[n].length;
        //convert single quoted string to double quoted string for JSON parse
        if(len >= 2 && ((chars[n].charAt(0) === "'" && chars[n].charAt(len - 1) === "'") ||
              (chars[n].charAt(0) === '"' && chars[n].charAt(len - 1) === '"'))){
          chars[n] = '"' + chars[n].substring(1, len - 1).replace(/\"/g, '\\"') + '"';
        }
        try {
          ar.push(JSON.parse(chars[n]));
        } catch(er){
          V_DEBUG({ methodName : methodName, error : er });
          ar.push(undefined);
        }
      };
      for(var di, si, eg, fg, n = 0; n < cl; n++){
        eg = chars[n].charAt(0);
        fg = chars[n].charAt(chars[n].length - 1);
        if(!(eg === fg && (eg === '"' || eg === "'"))){
          chars[n] = chars[n].trim();
          eg = chars[n].charAt(0);
          fg = chars[n].charAt(chars[n].length - 1);
        }
        di = chars[n].indexOf('"');
        si = chars[n].indexOf("'");
        if(((si === -1) && (di === -1)) || (eg === fg && (eg === '"' || eg === "'")) ||
          (chars[n].charAt(0) === "{" && chars[n].charAt(chars[n].length-1) === "}" &&
          (chars[n].match(/\{/g).length === chars[n].match(/\}/g).length)) ||
          (chars[n].charAt(0) === "[" && chars[n].charAt(chars[n].length-1) === "]" &&
          (chars[n].match(/\[/g).length === chars[n].match(/\]/g).length))){
          pushInto(n);
        } else if(n < (cl-1)) {
          chars[n] = chars[n] + ','+ chars[n+1];
          chars.splice(n+1,1);
          n--;
          cl--;
          continue;
        }
      }
    }
    return ar;
  };

  var VAR_MAP = {}, FUNC_MAP = {}, DEF_NOT_FOUND_MSG = 'VAR_NOT_FOUND',
      START_VAR = '{{', END_VAR = '}}', SPCL_VAR = '{{*}}',
      SVAR_L = START_VAR.length, EVAR_L = END_VAR.length;

  // tested here https://jsfiddle.net/zg85982k/1/

  var extractVarName = function(variable){
    return variable.substring(SVAR_L, variable.length - EVAR_L); // will remove the enclosing braces
  };

  //this method will extract all the variables available in the string
  //variable names will be having enclosing braces
  var extractVars = function(str){
    var regex = /(\{\{[a-z_A-Z0-9:\$\.\-]+\}\})+?/g;
    return str.match(regex) || [];
  };

  //extract method name from input method string e.g. {{method_name("hello", "world")}}
  // will return "method_name"
  var extractMethodName = function(methodDec){
    return methodDec.substring(SVAR_L, methodDec.indexOf('('));
  };

  //this method will extract all the methods available in the string
  var extractMethods = function(str){
    var regex = /(\{\{[a-z_A-Z0-9:\-]+\(.*?\)\}\})+/g;
    return str.match(regex) || [];
  };

  //replaces a single variable (only variable) in the string, if exists
  var replaceVariable = function(str, varName, varValue){
    if(str === varName) return varValue;
    var strType = typeof varValue === "string", ln = str.length;
    var patt = (strType || (str.indexOf('{{') !== 0 || str.indexOf('}}') !== (ln-2))) ? varName : '"'+varName+'"';
    var rValue = strType ? varValue : JSON.stringify(varValue);
    return str.replace(patt,function(){ return rValue; });
  };

  var getVarVal = function(varVal, varName, variablesMap){
    if(typeof variablesMap !== 'object' || !variablesMap){
      variablesMap = VAR_MAP;
    }
    if(varName.indexOf('.') !== -1){
      var spls = varName.split('.'), ln = spls.length, valFound = true;
      if(ln){
        var base = getVarVal(spls[0], spls[0], variablesMap), curVal;
        for(var j = 1; j < ln; j++){
          if(spls[j].length){
            if(typeof base === 'object'){
              curVal = ((spls[j].indexOf('$')) === 0)
                ? getVarVal(spls[j], spls[j], variablesMap) : spls[j];
              try {
                base = base[curVal];
              } catch(er){
                V_DEBUG(er);
                valFound = false;
              }
            } else {
              valFound = false;
            }
          }
        }
        if(valFound){
          return base;
        }
      }
    }
    return variablesMap.hasOwnProperty(varName) ? variablesMap[varName] : varVal;
  };

  var replaceVariables = function(str, vars, variablesMap, options){
    var varName, replaced, reReplaceRequired, res, ren;
    for(var i = 0; i < vars.length; i++){
      varName = extractVarName(vars[i]);
      reReplaceRequired = ((varName.indexOf('.$') !== -1) && (!options || options.reReplaceRequired !== false));
      replaced = getVarVal(vars[i], varName, variablesMap);
      if(reReplaceRequired){
        replaced = myModule.getReplacedStringifiedObject(replaced, { castInString : (typeof replaced === 'string') });
      }
      str = replaceVariable(str, vars[i], replaced);
    }
    return str;
  };

  var invokeMethod = function(method, params, methodName, methodsMap){
    try {
      return method.apply(methodsMap, params);
    } catch(eri) {
      V_DEBUG({ methodName : methodName, error : eri });
      return 'V_UTILITY_ERROR';
    }
  };

  var extractMethodParams = function(methodDec, methodName, options){
    var params = [];
    if(Array.isArray(options.prefixes)){
      copy(params, options.prefixes);
    }
    var baseDec = methodDec.substring(methodName.length + SVAR_L + 1, methodDec.length - (EVAR_L + 1)).trim();
    params = params.concat(extractParameters(baseDec, methodName));
    return params;
  };

  var getMethodValue = function(methodDec, methodName, method, methodsMap, options){
    var methodParams = extractMethodParams(methodDec, methodName, options);
    return invokeMethod(method, methodParams, methodName, methodsMap);
  };

  //invokes a single method and replaces its value in the string
  var replaceMethod = function(str, methodDec, methodName, method, methodsMap, options){
    var methodValue = getMethodValue(methodDec, methodName, method, methodsMap, options);
    if(str === methodDec) return methodValue;
    return str.replace(methodDec, function(){ return methodValue; });
  };

  var replaceMethods = function(str, methods, methodsMap, options){
    var methodName = "";
    for(var i = 0; i < methods.length; i++){
      methodName = extractMethodName(methods[i]);
      if(typeof methodsMap[methodName] === 'function'){
        str = replaceMethod(str, methods[i], methodName, methodsMap[methodName], methodsMap, options);
      }
    }
    return str;
  };

  var myModule = {
    init : function(options){
      if(!isObject(options)) options = {};
      copy(VAR_MAP, options.variablesMap);
      copy(FUNC_MAP, options.functionsMap);
      if(typeof options.defaultNotFoundMsg === 'string' && options.defaultNotFoundMsg) {
        DEF_NOT_FOUND_MSG = options.defaultNotFoundMsg;
      }
      if(typeof options.V_DEBUG === 'function'){
        V_DEBUG = options.V_DEBUG;
      }
      if(typeof options.startVar === 'string' && options.startVar) {
        START_VAR = options.startVar;
        SVAR_L = START_VAR.length;
      }
      if(typeof options.endVar === 'string' && options.endVar) {
        END_VAR = options.endVar;
        EVAR_L = END_VAR.length;
      }
    },

    walkInto : function(fun, rt, obj, key){
      fun(obj, key, rt);
      if(typeof obj === 'object' && obj){
        var kys = Object.keys(obj), kl = kys.length;
        for(var j =0; j< kl; j++){
          this.walkInto(fun, obj, obj[kys[j]], kys[j]);
        }
      }
    },

    isWithVars : function(st){
      if(st && typeof st === 'string' && st.length > (END_VAR.length+START_VAR.length)) {
        var f = st.indexOf(START_VAR), l = st.indexOf(END_VAR);
        return (f !== -1 && l !== -1);
      } else return false;
    },

    replaceIntoObjectOrString : function(obj){
      if(typeof obj === 'string'){ try { obj = JSON.parse(obj); } catch(er){ } }
      if(typeof obj === 'object' && obj){
        var no = {};
        this.walkInto(function(valn, key, rt){
          if(typeof rt === 'object' && rt && rt.hasOwnProperty(key)){
            var val = rt[key], tmpKy = null;
            if(myModule.isWithVars(key) && key !== SPCL_VAR){
              tmpKy = myModule.replace(key, { reReplaceRequired : false });
              if(tmpKy !== key){
                val = rt[tmpKy] = rt[key];
                delete rt[key];
              }
            }
            if(typeof val === 'string' && val && val !== SPCL_VAR){
              if(myModule.isWithVars(val)){
                rt[tmpKy || key] = myModule.replace(val, { reReplaceRequired : false });
              }
            }
          }
        }, null, obj);
      } else if(obj && obj === 'string'){
        obj = myModule.replace(obj, { reReplaceRequired : false });
      }
      return obj;
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

    getReplacedStringifiedObject : function(obj,opt){
      if(typeof opt !== 'object' || !opt){ opt = {}; }
      if(obj){
        if(!opt.dontParse){
          obj = myModule.getJsonOrString(obj);
        }
        myModule.replaceIntoObjectOrString(obj);
      }
      if(typeof obj !== 'object'){
        obj = myModule.replace(String(obj), opt);
      }
      return (typeof obj !== 'string' && opt.castInString) ? JSON.stringify(obj) : obj;
    },

    replace : function(str, options){
      if(!isString(str)) return str;
      if(!isObject(options)) options = {};

      str = replaceVariables(str, extractVars(str), VAR_MAP, options);

      //if str becomes not a string then return as it is
      if(!isString(str)) return str;

      //now in our input string, all the variables are replaced
      //now the below method will automatically find all the methods, bcoz no variables are there in the string
      return replaceMethods(str, extractMethods(str), FUNC_MAP, options);
    },

    getVars : function(){
      return VAR_MAP;
    },

    clearVars: function(){
      for (var prop in VAR_MAP) { if (VAR_MAP.hasOwnProperty(prop)) { delete VAR_MAP[prop]; } }
      VAR_MAP.$ = 0;
      VAR_MAP.$tc = {};
      VAR_MAP.$tr = {};
    },

    getFuncs : function(){
      return FUNC_MAP;
    }

  };

  var root = this;

  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = myModule;
    }
    exports.myModule = myModule;
  } else {
    root.myModule = myModule;
  }

  if(typeof define === 'function' && define.amd) {
    define('replaceStringModule', [], function() {
      return myModule;
    });
  }

}).call(this);
