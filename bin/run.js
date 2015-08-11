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
    case '-H':
    case '--help':
      showHelp = true;
      break;
    default :
      options.url = value;
  }
});


if(showHelp){
  console.log('    vRUNNER : Runs vREST test cases.\n');
  console.log('    usage          : vrunner --email=<vrest_email> --password=<vrest_password> [--logger=<one_of_available_loggers>] '
      +'[--filepath="<path_of_json_file_for_logger_other_than_console>"] --url="<vrest_testcase_list_url>"\n');
  console.log('    -E, --email    : Your registered email address of vREST account.');
  console.log('    -P, --password : Your password of vREST account.');
  console.log('    -L, --logger   : Your desired logging of the vRUNNER execution process and result.');
  console.log('                    This can be either `console` or `json` or `xunit`.');
  console.log('                    By default `console` is considered.');
  console.log('    -F, --filepath : Valid if any other than `console` logger is selected.');
  console.log('                    Absolute path of the log file, into which execution process and result log will be dumped.');
  console.log('                    If path/file is not present, tool will try to setup that path, and create file automatically.');
  console.log('                    Please note that if file already exists, that will be overwritten.');
  console.log('                    By default it will the path of file named `logs` in current directory.');
  console.log('    -H, --help     : To see manual of vRUNNER.');
  process.exit();
} else {
  (new (require('./../index'))(options)).run();
}
