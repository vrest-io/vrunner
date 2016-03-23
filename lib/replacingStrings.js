(function() {

  var isObject = function(obj) {
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
  };

  var VAR_MAP = {}, FUNC_MAP = {}, DEF_NOT_FOUND_MSG = 'VAR_NOT_FOUND',
      START_VAR = '{{', END_VAR = '}}', SVAR_L = START_VAR.length, EVAR_L = END_VAR.length;

  // tested here https://jsfiddle.net/zg85982k/1/

  var extractVarName = function(variable){
    return variable.substring(SVAR_L, variable.length - EVAR_L); // will remove the enclosing braces
  };

  //this method will extract all the variables available in the string
  //variable names will be having enclosing braces
  var extractVars = function(str){
    var regex = /(\{\{[a-z_A-Z0-9:\-]+\}\})+/g;
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
    return str.replace(varName, varValue);
  };

  var replaceVariables = function(str, vars, variablesMap){
    for(var i = 0; i < vars.length; i++){
      var varName = extractVarName(vars[i]);
      str = replaceVariable(str, vars[i], variablesMap[varName] || vars[i]);
    }
    return str;
  };

  var invokeMethod = function(method, params){
    return method.apply(undefined, params);
  };

  var extractMethodParams = function(methodDec, methodName, options){
    var params = [];
    if(Array.isArray(options.prefixes)){
      copy(params, options.prefixes);
    }
    var baseDec = methodDec.substring(methodName.length + SVAR_L + 1, methodDec.length - (EVAR_L + 1));
    var subs = baseDec.split(',');
    if(subs.length){
      for(var z = 0; z < subs.length; z++){
        subs[z] = subs[z].trim();
        var eg = subs[z].charAt(0), fg = subs[z].charAt(subs[z].length - 1);
        if(eg === fg && (eg === '"' || eg === "'"))
          subs[z] = "\"" + subs[z].substring(1, subs[z].length - 1) + "\"";
        try { params.push(JSON.parse(subs[z])); } catch(b){ }
      }
    }
    return params;
  };

  var getMethodValue = function(methodDec, methodName, method, options){
    var methodParams = extractMethodParams(methodDec, methodName, options);
    return invokeMethod(method, methodParams);
  };

  //invokes a single method and replaces its value in the string
  var replaceMethod = function(str, methodDec, methodName, method, options){
    var methodValue = getMethodValue(methodDec, methodName, method, options);
    if(str === methodDec) return methodValue;
    return str.replace(methodDec, methodValue);
  };

  var replaceMethods = function(str, methods, methodsMap, options){
    var methodName = "";
    for(var i = 0; i < methods.length; i++){
      methodName = extractMethodName(methods[i]);
      str = replaceMethod(str, methods[i], methodName, methodsMap[methodName] || function(){ return 'NO_UTILITY_METHOD'; }, options);
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
      if(typeof options.startVar === 'string' && options.startVar) {
        START_VAR = options.startVar;
        SVAR_L = START_VAR.length;
      }
      if(typeof options.endVar === 'string' && options.endVar) {
        END_VAR = options.endVar;
        EVAR_L = END_VAR.length;
      }
    },

    replace : function(str, options){
      if(!isString(str)) return str;
      if(!isObject(options)) options = {};

      str = replaceVariables(str, extractVars(str), VAR_MAP);

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