module.exports = {
	assertionNameDesc: {
	  statusCode: 'Status Code',
	  responseTime: 'Response Time',
	  header: 'Header',
	  jsonBody: 'JSON Body',
	  xmlBody: 'XML Body',
	  textBody: 'Text Body'
	},

	assertionTypeDesc: {
	  isANumber: 'a number',
	  isABoolean: 'a boolean',
	  equals: 'equal to',
	  doesNotEqual: 'equal to',
	  isEmpty: 'empty',
	  isNotEmpty: 'empty',
	  contains: 'contained',
	  doesNotContain: 'contains',
	  equalToNumber: 'a number equal to number',
	  doesNotEqualToNumber: 'a number equal to number',
	  lessThan: 'a number less than',
	  lessThanOrEqualTo: 'a number less than or equal to',
	  greaterThan: 'a number greater than',
	  greaterThanOrEqualTo: 'a number greater than or equal to',
	  hasKey: 'contains key',
	  hasValue: 'contains value',
	  isNull: 'null'
	},

	assertTypeSummary: function(type, actual, expected, ifPassed, remarks, validator){
	  var result = '', desc = this.assertionTypeDesc[type] || type,
	    notOnFail = ifPassed?'':'not ', notOnPass = ifPassed?'not ':'';

	  if(validator){ //if validator involved
	    result += validator + ' ';
	    if(ifPassed) result += 'passed';
	    else result += 'failed';
	    result += ' the assertion';
	    //commented due to Log JIRA issue feature.
	    //if(remarks) result += ' with following remarks';
	  } else {
	    switch(type){
	      case 'equals':
	        result += '`' + actual + '` was ' + notOnFail + desc + ' `' + expected + '`';
	        break;
	      case 'equalToNumber':
	      case 'lessThan':
	      case 'lessThanOrEqualTo':
	      case 'greaterThan':
	      case 'greaterThanOrEqualTo':
	      case 'doesNotEqualToNumber':
	        if(expected === '') result += 'expected value was empty';
	        else if(actual === '') result += 'actual value was empty';
	        else if(typeof actual === 'boolean') result += 'actual value received was of type boolean';
	        else if(actual === null) result += 'actual value received was null';
	        else if(isNaN(actual)) result += 'actual value `'+actual+'`  was not a valid number';
	        else if(isNaN(expected)) result += 'expected value `'+expected+'` was not a valid number';
	        else {
	          var notStr = (type === 'doesNotEqualToNumber')?notOnPass:notOnFail;
	          result += '`' + actual + '` was ' + notStr + desc + ' `' + expected + '`';
	        }
	        break;
	      case 'doesNotEqual':
	        result += '`' + actual + '` was ' + notOnPass + desc + ' `' + expected + '`';
	        break;
	      case 'isANumber':
	      case 'isABoolean':
	        //result += '`' + actual + '` was ' + notOnFail + desc;
	        result += 'was ' + notOnFail + desc;
	        break;
	      case 'isEmpty':
	        result += '`' + actual + '` was ' + notOnFail + desc;
	        break;
	      case 'isNotEmpty':
	        result += '`' + actual + '` was ' + notOnPass + desc;
	        break;
	      case 'matches':
	        result += ('`' + actual + '`'+(ifPassed ? '': ' did not')
	          +' matched with RegEx `'+expected+'`');
	        break;
	      case 'contains':
	        if(typeof actual === 'string'){
	          result += '`' + actual + '` ';
	          if(ifPassed) result += 'contained';
	          else result += 'did not contain';
	          result += ' `' + expected + '`';
	        } else {
	          result += 'type of actual value is not string';
	        }
	        break;
	      case 'doesNotContain':
	        if(typeof actual === 'string'){
	          result += '`' + actual + '` ';
	          if(ifPassed) result += 'did not contain';
	          else result += 'contained';
	          result += ' `' + expected + '`';
	        } else {
	          result += 'type of actual value is not string';
	        }
	        break;
	      case 'hasKey':
	        result += 'was '+ notOnFail + 'having the key `' + expected + '`';
	        break;
	      case 'hasValue':
	        if(ifPassed) result += 'was having some value';
	        else result += 'was not having any value';
	        break;
	      case 'isNull':
	        result += 'value was ' + notOnFail + 'null'
	        break;
	    }
	  }

	  return result;
	},

	getReadableString : function(st,blank){
	  if(blank && (st === undefined || st === null)) return '';
	  if(typeof st === 'string') return st;
	  if(typeof st === 'object') return JSON.stringify(st);
	  return String(st);
	},

	getAssertionResultSummary: function(index, ass, mongoIdRegex, validatorIdNameMap, cropString){
	    var result = '';
	    if(ass.assertion){
	      var remarks = ass.remarks,
	          assertType = ass.assertion.type,
	          property = ass.assertion.property,
	          actual = cropString(this.getReadableString(ass.assertion.actual,true), 99),
	          expected = cropString(this.getReadableString(ass.assertion.expected,true), 99),
	          name = ass.assertion.name,
	          assertionNameDesc = (index + 1) + '. '+ this.assertionNameDesc[name] || name,
	          result = assertionNameDesc + ' - ',
	          validator = null,
	          isValid = true;
	      if(name === 'textBody' && mongoIdRegex.test(assertType)){ //if validator involved
	        validator = validatorIdNameMap[assertType] || 'Linked validator';
	      } else {
	        result += (assertType + ' - ');
	      }
	      if(name === 'header') {
	        if(property) result += '[' + property + '] ';
	        else {
	          result += '[No Header name specified]';
	          isValid = false;
	        }
	      } else if(name === 'jsonBody' || name === 'xmlBody'){
	        var whichPath = (name === 'jsonBody' ? 'JSON' : 'X');
	        if(property) result += '[Path-`' + property + '`] ';
	        else {
	          result += '[Path-`No '+whichPath+'-Path Specified`]';
	          isValid = false;
	        }
	        if(actual === 'V_PATH_NOT_RESOLVED'){
	          result += ' '+whichPath+'-Path not found in the actual response';
	          isValid = false;
	        }
	      }

	      if(isValid) result += this.assertTypeSummary(assertType, actual, expected, ass.passed, remarks, validator);
	    } else if(!ass.passed) result += 'Assertion failed due to insufficient data. Please check the defined assertion again';

	    result += '.';
	    return result;
  	}
};