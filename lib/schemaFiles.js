/*
 * Has been downloaded from the $schema property of each schema
 */
module.exports = function() {
  return {
    'draft04ValidatorFile': {
      "id": "http://json-schema.org/draft-04/schema#",
      "$schema": "http://json-schema.org/draft-04/schema#",
      "description": "Core schema meta-schema",
      "definitions": {
        "schemaArray": {
          "type": "array",
          "minItems": 1,
          "items": { "$ref": "#" }
        },
        "positiveInteger": {
          "type": "integer",
          "minimum": 0
        },
        "positiveIntegerDefault0": {
          "allOf": [ { "$ref": "#/definitions/positiveInteger" }, { "default": 0 } ]
        },
        "simpleTypes": {
          "enum": [ "array", "boolean", "integer", "null", "number", "object", "string" ]
        },
        "stringArray": {
          "type": "array",
          "items": { "type": "string" },
          "minItems": 1,
          "uniqueItems": true
        }
      },
      "type": "object",
      "properties": {
          "id": {
            "type": "string",
            "format": "uri"
          },
          "$schema": {
            "type": "string",
            "format": "uri"
          },
          "title": {
            "type": "string"
          },
          "description": {
            "type": "string"
          },
          "default": {},
          "multipleOf": {
            "type": "number",
            "minimum": 0,
            "exclusiveMinimum": true
          },
          "maximum": {
            "type": "number"
          },
          "exclusiveMaximum": {
            "type": "boolean",
            "default": false
          },
          "minimum": {
            "type": "number"
          },
          "exclusiveMinimum": {
            "type": "boolean",
            "default": false
          },
          "maxLength": { "$ref": "#/definitions/positiveInteger" },
          "minLength": { "$ref": "#/definitions/positiveIntegerDefault0" },
          "pattern": {
            "type": "string",
            "format": "regex"
          },
          "additionalItems": {
            "anyOf": [
              { "type": "boolean" },
              { "$ref": "#" }
            ],
            "default": {}
          },
          "items": {
            "anyOf": [
              { "$ref": "#" },
              { "$ref": "#/definitions/schemaArray" }
            ],
            "default": {}
          },
          "maxItems": { "$ref": "#/definitions/positiveInteger" },
          "minItems": { "$ref": "#/definitions/positiveIntegerDefault0" },
          "uniqueItems": {
            "type": "boolean",
            "default": false
          },
          "maxProperties": { "$ref": "#/definitions/positiveInteger" },
          "minProperties": { "$ref": "#/definitions/positiveIntegerDefault0" },
          "required": { "$ref": "#/definitions/stringArray" },
          "additionalProperties": {
            "anyOf": [
              { "type": "boolean" },
              { "$ref": "#" }
            ],
            "default": {}
          },
          "definitions": {
            "type": "object",
            "additionalProperties": { "$ref": "#" },
            "default": {}
          },
          "properties": {
            "type": "object",
            "additionalProperties": { "$ref": "#" },
            "default": {}
          },
          "patternProperties": {
            "type": "object",
            "additionalProperties": { "$ref": "#" },
            "default": {}
          },
          "dependencies": {
            "type": "object",
            "additionalProperties": {
              "anyOf": [
                { "$ref": "#" },
                { "$ref": "#/definitions/stringArray" }
              ]
            }
          },
          "enum": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true
          },
          "type": {
            "anyOf": [
              { "$ref": "#/definitions/simpleTypes" },
              {
                "type": "array",
                "items": { "$ref": "#/definitions/simpleTypes" },
                "minItems": 1,
                "uniqueItems": true
              }
            ]
          },
          "allOf": { "$ref": "#/definitions/schemaArray" },
          "anyOf": { "$ref": "#/definitions/schemaArray" },
          "oneOf": { "$ref": "#/definitions/schemaArray" },
          "not": { "$ref": "#" }
      },
      "dependencies": {
        "exclusiveMaximum": [ "maximum" ],
        "exclusiveMinimum": [ "minimum" ]
      },
      "default": {}
    },
    'draft03Validator': function (/*Any*/instance,/*Object*/schema,/*Object*/options) {

      var primitiveConstructors = { String: String, Boolean: Boolean, Number: Number, Object: Object, Array: Array, Date: Date };

      if (!options) options = {changing: false};
      var _changing = options.changing;

      function getType(schema){
        return schema.type || (primitiveConstructors[schema.name] == schema && schema.name.toLowerCase());
      }
      var errors = [];
      // validate a value against a property definition
      function checkProp(value, schema, path,i){

         var l;
         path += path ? typeof i == 'number' ? '[' + i + ']' : typeof i == 'undefined' ? '' : '.' + i : i;
         function addError(message){
           errors.push({property:path,message:message});
         }

         if((typeof schema != 'object' || schema instanceof Array) &&
             (path || typeof schema != 'function') && !(schema && getType(schema))){
             if(typeof schema == 'function'){
                 if(!(value instanceof schema)){
                     addError("is not an instance of the class/constructor " + schema.name);
                 }
             }else if(schema){
                 addError("Invalid schema/property definition " + schema);
             }
             return null;
         }
         if(_changing && schema.readonly){
             addError("is a readonly field, it can not be changed");
         }
         if(schema['extends']){ // if it extends another schema, it must pass that schema as well
             checkProp(value,schema['extends'],path,i);
         }
         // validate a value against a type definition
         function checkType(type,value){
             if(type){
                 if(typeof type == 'string' && type != 'any' &&
                         (type == 'null' ? value !== null : typeof value != type) &&
                         !(value instanceof Array && type == 'array') &&
                         !(value instanceof Date && type == 'date') &&
                         !(type == 'integer' && value%1===0)){
                     return [{property:path,message:(typeof value) + " value found, but a " + type + " is required"}];
                 }
                 if(type instanceof Array){
                     var unionErrors=[];
                     for(var j = 0; j < type.length; j++){ // a union type
                         if(!(unionErrors=checkType(type[j],value)).length){
                             break;
                         }
                     }
                     if(unionErrors.length){
                         return unionErrors;
                     }
                 }else if(typeof type == 'object'){
                     var priorErrors = errors;
                     errors = [];
                     checkProp(value,type,path);
                     var theseErrors = errors;
                     errors = priorErrors;
                     return theseErrors;
                 }
             }
             return [];
         }
         if(value === undefined){
             if(schema.required){
                 addError("is missing and it is required");
             }
         } else{
             errors = errors.concat(checkType(getType(schema),value));
             if(schema.disallow && !checkType(schema.disallow,value).length){
                 addError(" disallowed value was matched");
             }
             if(value !== null){
                 if(value instanceof Array){
                     if(schema.items){
                         var itemsIsArray = schema.items instanceof Array;
                         var propDef = schema.items;
                         for (i = 0, l = value.length; i < l; i += 1) {
                             if (itemsIsArray)
                                 propDef = schema.items[i];
                             if (options.coerce)
                                 value[i] = options.coerce(value[i], propDef);
                             errors.concat(checkProp(value[i],propDef,path,i));
                         }
                     }
                     if(schema.minItems && value.length < schema.minItems){
                         addError("There must be a minimum of " + schema.minItems + " in the array");
                     }
                     if(schema.maxItems && value.length > schema.maxItems){
                         addError("There must be a maximum of " + schema.maxItems + " in the array");
                     }
                 }else if(schema.properties || schema.additionalProperties){
                     errors.concat(checkObj(value, schema.properties, path, schema.additionalProperties));
                 }
                 if(schema.pattern && typeof value == 'string' && !value.match(schema.pattern)){
                     addError("does not match the regex pattern " + schema.pattern);
                 }
                 if(schema.maxLength && typeof value == 'string' && value.length > schema.maxLength){
                     addError("may only be " + schema.maxLength + " characters long");
                 }
                 if(schema.minLength && typeof value == 'string' && value.length < schema.minLength){
                     addError("must be at least " + schema.minLength + " characters long");
                 }
                 if(typeof schema.minimum !== undefined && typeof value == typeof schema.minimum &&
                         schema.minimum > value){
                     addError("must have a minimum value of " + schema.minimum);
                 }
                 if(typeof schema.maximum !== undefined && typeof value == typeof schema.maximum &&
                         schema.maximum < value){
                     addError("must have a maximum value of " + schema.maximum);
                 }
                 if(schema['enum']){
                     var enumer = schema['enum'];
                     l = enumer.length;
                     var found;
                     for(var j = 0; j < l; j++){
                         if(enumer[j]===value){
                             found=1;
                             break;
                         }
                     }
                     if(!found){
                         addError("does not have a value in the enumeration " + enumer.join(", "));
                     }
                 }
                 if(typeof schema.maxDecimal == 'number' &&
                     (value.toString().match(new RegExp("\\.[0-9]{" + (schema.maxDecimal + 1) + ",}")))){
                     addError("may only have " + schema.maxDecimal + " digits of decimal places");
                 }
             }
         }
         return null;
      }
      // validate an object against a schema
      function checkObj(instance,objTypeDef,path,additionalProp){

         if(typeof objTypeDef =='object'){
             if(typeof instance != 'object' || instance instanceof Array){
                 errors.push({property:path,message:"an object is required"});
             }

             for(var i in objTypeDef){
                 if(objTypeDef.hasOwnProperty(i)){
                     var value = instance[i];
                     // skip _not_ specified properties
                     if (value === undefined && options.existingOnly) continue;
                     var propDef = objTypeDef[i];
                     // set default
                     if(value === undefined && propDef["default"]){
                         value = instance[i] = propDef["default"];
                     }
                     if(options.coerce && i in instance){
                         value = instance[i] = options.coerce(value, propDef);
                     }
                     checkProp(value,propDef,path,i);
                 }
             }
         }
         for(i in instance){
             if(instance.hasOwnProperty(i) && !(i.charAt(0) == '_' && i.charAt(1) == '_')
                 && objTypeDef && !objTypeDef[i] && additionalProp===false){
                 if (options.filter) {
                     delete instance[i];
                     continue;
                 } else {
                     errors.push({property:path,message:(typeof value) + "The property " + i +
                         " is not defined in the schema and the schema does not allow additional properties"});
                 }
             }
             var requires = objTypeDef && objTypeDef[i] && objTypeDef[i].requires;
             if(requires && !(requires in instance)){
                 errors.push({property:path,message:"the presence of the property " + i + " requires that " +
                   requires + " also be present"});
             }
             value = instance[i];
             if(additionalProp && (!(objTypeDef && typeof objTypeDef == 'object') || !(i in objTypeDef))){
                 if(options.coerce){
                     value = instance[i] = options.coerce(value, additionalProp);
                 }
                 checkProp(value,additionalProp,path,i);
             }
             if(!_changing && value && value.$schema){
                 errors = errors.concat(checkProp(value,value.$schema,path,i));
             }
         }
         return errors;
       }
       if(schema){
           checkProp(instance,schema,'',_changing || '');
       }
       if(!_changing && instance && instance.$schema){
           checkProp(instance,instance.$schema,'','');
       }
       return {valid:!errors.length,errors:errors};
    }
  };
}
