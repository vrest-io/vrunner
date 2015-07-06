#!/usr/bin/env node

var vrunner = require('./../index'), chalk = require('chalk');

//add right side padding
var rpad = function(str, totalSize, padChar){
  if(!padChar) padChar = ' ';
  if(str.length >= totalSize) return str;
  else {
    for(var i = str.length; i < totalSize; i++){
      str += padChar;
    }
    return str;
  }
};

var getMethodName = function(method){
  if(method === "GET") return chalk.blue.bold(method) + '    ';
  else if(method === "POST") return chalk.bold(method) + '   ';
  else if(method === "PUT") return chalk.green.bold(method) + '    ';
  else if(method === "PATCH") return chalk.magenta.bold(method) + '  ';
  else if(method === "DELETE") return chalk.red.bold(method) + ' ';
  else return chalk.bold(method) + ' ';
};

var done = function(){ };
var over = function(err,dontExit){
  if(!err) err = 'An unknown glitch found.';
  if(!Array.isArray(err)) err = [err];
  err.forEach(function(error){
    console.log(error);
  });
  if(!dontExit) done();
};
var options = {
  credentials : {
    email : process.env.VREST_EMAIL,
    password : process.env.VREST_PASSWORD
  },
  url: process.env.VREST_URL
};
var Runner = (new vrunner(options));
Runner.run(function(err,report,remarks){
  if(err) over(err);
  else {
    console.log('EXECUTION OF ALL TEST CASES SUCCESSFULLY COMPLETED.');
    console.log(remarks,report);
    done();
  }
});

var index = 1;
Runner.on('testcase',function(pass,tc,trtc){
  var prefix = rpad(index + '.', 5) + getMethodName(tc.method);
  index++;
  if(pass){
    console.log(prefix + chalk.green.bold(tc.summary || tc.url) + ' (' + trtc.executionTime + 'ms) ');
  } else if(pass === false){
    console.log(prefix + chalk.red.bold(tc.summary || tc.url) + ' (' + trtc.executionTime + 'ms) ');
  } else {
    console.log(prefix + chalk.cyan.bold('[Not Executed] ' + (tc.summary || tc.url)) + ' (' + trtc.executionTime + 'ms) ');
  }
});

Runner.on('error',function(err){
  console.log('ERROR...!');
  over(err);
});

Runner.on('log', function(message, level){
  if(!level) level = 'info';
  message = '>> ' + message;
  if(level === 'error') message = chalk.red.bold(message);
  else message = chalk.blue.bold(message);
  console.log(message);
});

Runner.on('warning',function(warning){
  //console.log(chalk.yellow('WARNING'));
  //over(warning,true);
});
