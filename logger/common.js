'use strict';

var chalk = require('chalk'), index = 1, rpad = function(str, totalSize, padChar){
  if(!padChar) padChar = ' ';
  if(str.length >= totalSize) return str;
  else {
    for(var i = str.length; i < totalSize; i++){
      str += padChar;
    }
    return str;
  }
}, callChalk = function(arr,str){
  if(typeof arr === 'string') return chalk[arr](str);
  for(var pr = chalk, i = 0, c = arr.length; i < c;i++){
    pr = pr[arr[i]];
  }
  return pr(str);
}, over = function(errorLogger,runner,err,dontExit){
  if(!err) err = 'An unknown glitch found.';
  if(!Array.isArray(err)) err = [err];
  err.forEach(function(error){
    errorLogger(error);
  });
  if(!dontExit) done(runner);
  runner.emit('over', err);
}, done = function(runner){
  runner.emit('done');
}, getMethodName = function(method){
  if(method === "GET") return callChalk(['blue','bold'],method) + '    ';
  else if(method === "POST") return callChalk('bold',method) + '   ';
  else if(method === "PUT") return callChalk(['green','bold'],method) + '    ';
  else if(method === "PATCH") return callChalk(['magenta','bold'],method) + '  ';
  else if(method === "DELETE") return callChalk(['red','bold'],method) + ' ';
  else return callChalk('bold',method) + ' ';
};

module.exports = function(args){
  var Runner = args.runner;
  if(Runner.logger !== 'console') callChalk = function(ar,str) { return str; };
  Runner.on('testcase', function(pass, tc, trtc){
    var prefix = rpad(index + '.', 5) + getMethodName(tc.method);
    index++;
    if(pass){
      args.testcaseLogger(prefix + callChalk(['green','bold'],tc.summary || tc.url) + ' (' + trtc.executionTime + 'ms) ');
    } else if(pass === false){
      args.testcaseLogger(prefix + callChalk(['red','bold'],tc.summary || tc.url) + ' (' + trtc.executionTime + 'ms) ');
    } else {
      args.testcaseLogger(prefix + callChalk(['cyan','bold'],'[Not Executed] ' + (tc.summary || tc.url)) +
        ' (' + trtc.executionTime + 'ms) ');
    }
  });
  Runner.on('end',function(err, report, remarks){
    if(err) over(args.errorLogger,Runner,err);
    else {
      args.remarksLogger(remarks);
      args.reportsLogger(report);
      if(report.failed) over(args.errorLogger,Runner, 'Some of the test cases have failed.');
      else {
        args.logger('EXECUTION OF ALL TEST CASES SUCCESSFULLY COMPLETED.');
        done(Runner);
      }
    }
  });
  Runner.on('error', function(err){
    args.logger('ERROR...!');
    over(args.errorLogger,Runner,err);
  });
  Runner.on('log', function(message, level){
    if(!level) level = 'info';
    message = '>> ' + message;
    if(level === 'error') message = callChalk(['red','bold'],message);
    else message = callChalk(['blue','bold'],message);
    args.logger(message);
  });
  Runner.on('warning', function(warning){
    //args.warningLogger(callChalk(['yellow','bold'],'WARNING'));
    //over(warning, true);
  });
};
