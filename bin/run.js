#!/usr/bin/env node

var options = {
  credentials : {
    email : process.env.VREST_EMAIL,
    password : process.env.VREST_PASSWORD
  },
  url: process.env.VREST_URL
};

var opts = process.argv.slice(2), showHelp = false, util = require('./../lib/util');

if(!opts.length) showHelp = true;

opts.forEach(function(arg){
  var ind = arg.indexOf('=');
  if(ind === -1) return showHelp = true;
  else var key = arg.substr(0,ind), value = arg.substr(ind+1);
  switch(key){
    case '-E':
    case '--email':
      options.credentials.email = value;
      break;
    case '-P':
    case '--password':
      options.credentials.password = value;
      break;
    case '-L':
    case '--logger':
      options.logger = value;
      break;
    case '-F':
    case '--filepath':
      options.filePath = value;
      break;
    case '--vrestbaseurl':
      options.vRestBaseUrl = value;
      break;
    case '-H':
    case '--help':
      showHelp = true;
      break;
    default :
      options.url = value;
  }
});


if(showHelp){
  console.log('\n    vRUNNER - Runs vREST test cases.\n');
  console.log('    Usage: vrunner --email=<vrest_email> --password=<vrest_password> --url="<vrest_testcase_list_url>"');
  console.log('           [--filepath="<path_of_log_file_for_logger_other_than_console>"] [--logger=<one_of_available_loggers>]\n');
  console.log('    Options:\n');
  console.log('    -E, --email    : Email ID through which you have registered on vREST');
  console.log('    -P, --password : Password of your vREST account');
  console.log('    -U, --url      : Provide the test case list URL here. You can find the test case list URL by going to your vREST');
  console.log('                     instance and select Test Cases tab. Now click on button "Copy Current Test Case List URL" available');
  console.log('                     in Left hand side, below the "Filters section". Provide the copied URL in this option.');
  console.log('    -L, --logger   : Your desired logging of the vRUNNER execution process and result.');
  console.log('                     This can be either `console` or `json` or `xunit`.');
  console.log('                     By default `console` logger is used.');
  console.log('    -F, --filepath : Valid if other than `console` logger is selected.');
  console.log('                     Absolute path of the log file, into which execution process and result logs will be dumped.');
  console.log('                     If path/file is not present, tool will try to setup that path, and create file automatically.');
  console.log('                     Please note that if file already exists, that will be overwritten.');
  console.log('                     By default it will be the `vrest/logs.[json|xml]` in current directory.');
  console.log('    -H, --help     : To see this help.');
  process.exit();
} else {
  (new (require('./../index'))(options)).run();
}
