#! /usr/bin/env node

var options = {
  credentials : {
    email : process.env.VREST_EMAIL,
    password : process.env.VREST_PASSWORD
  },
  url: process.env.VREST_URL
};
var opts = process.argv.slice(2), showHelp = false, util = require('./../lib/util');
var version = require('../package.json').version;
if(!opts.length) showHelp = true;

opts.forEach(function(arg){
  var ind = arg.indexOf('=');
  if(ind === -1) return showHelp = true;
  else var key = arg.substr(0,ind), value = arg.substr(ind+1);
  switch(key.toLowerCase()){
    case '-e':
    case '--email':
      options.credentials.email = value;
      break;
    case '-p':
    case '--password':
      options.credentials.password = value;
      break;
    case '-l':
    case '--logger':
      options.logger = value;
      break;
    case '-f':
    case '--filepath':
      options.filePath = value;
      break;
    case '-n':
    case '--env':
      options.projEnv = value;
      break;
    case '-d':
    case '--debug':
      options.debugging = (value === 'true');
      break;
    case '-r':
    case '--port':
      options.port = Number(value);
      if (isNaN(options.port)) { delete options.port; }
      break;
    case '-t':
    case '--timeout':
      options.timeout = value;
      break;
    case '--vrestbaseurl':
      options.vRESTBaseUrl = value;
      break;
    case '-s':
    case '--nosslcheck':
      options.nosslcheck = (value === 'true');
      break;
    case '-u':
    case '--url':
      options.url = value;
      break;
    case '-h':
    case '--help':
    default :
      console.log('    --> INVALID ARGUMENT `'+key+'` PROVIDED ...! Try again with valid arguments.');
      showHelp = true;
  }
});


if(showHelp){
  console.log('\n    vRUNNER - Runs vREST test cases.\n');
  console.log('    version - '+version+'\n');
  console.log('    Usage: vrunner --email=<vrest_email> --password=<vrest_password> ');
  console.log('           --url="<vrest_testcase_list_url>" [--env=<environment_name>]');
  console.log('           [--nosslcheck=<boolean_value>] [--debug=<boolean_value>] [--logger=<one_of_available_loggers>]');
  console.log('           [--filepath="<path_of_log_file_for_logger_other_than_console>"]');
  console.log('    Options:\n');
  console.log('    -E, --email      : Email ID through which you have registered on vREST');
  console.log('    -P, --password   : Password of your vREST account');
  console.log('    -U, --url        : Provide the test case list URL here. You can find the test case list URL by going to your vREST');
  console.log('                       instance and select Test Cases tab. Now click on button "Copy Current Test Case List URL" available');
  console.log('                       in Left hand side, below the "Filters section". Provide the copied URL in this option. Ensure that');
  console.log('                       you enclose the URL in double quotes.');
  console.log('    -T, --timeout    : How much to wait for response after execution of test case.');
  console.log('                       It should be provided in unit of seconds.');
  console.log('                       e.g. -T=3 will wait for 3 seconds for response');
  console.log('    -N, --env        : Provide the environment name to initialize the global variables.');
  console.log('                       By default environment `Default` is used.');
  console.log('    -R, --port       : If provided, vrunner will start a server as web hook.');
  console.log('                       You may use web hook as <vrunner_url>/execute.');
  console.log('    -D, --debug      : Should be set if you want debugging console logs.');
  console.log('                       By default debugging information are not logged.');
  console.log('    -S, --nosslcheck : If this argument is `true`, vRUNNER will process all requests, without Secure Certificate Check.');
  console.log('                       By default Secure Certificate Check is enabled. This option is useful in self-signed certificate issues.');
  console.log('    -L, --logger     : Your desired logging of the vRUNNER execution process and result.');
  console.log('                       This can be either `console` or `json` or `csv` or `xunit`.');
  console.log('                       By default `console` logger is used.');
  console.log('    -F, --filepath   : Valid if other than `console` logger is selected.');
  console.log('                       Absolute path of the log file, into which execution process and result logs will be dumped.');
  console.log('                       If path/file is not present, tool will try to setup that path, and create file automatically.');
  console.log('                       Please note that if file already exists, that will be overwritten.');
  console.log('                       By default it will be the `vrest/logs.[json|xml|csv]` in current directory.');
  console.log('    -H, --help       : To see this help.');
  process.exit();
} else {
  if (options.port) {
    var http = require('http');
    var util = require('../lib/util');
    var mainUrl = require('url');

    var requestHandler = function(request, response) {
      if(request.url === '/request') {
        (new (require('./../index'))(util.extend({ exitOnDone: false }, options, mainUrl.parse(req.url, true).query))).run();
      }
    };

    var server = require('http').createServer(requestHandler);
    server.listen(options.port, function(err) {
      if (err) {
        return console.log('something bad happened', err)
      }
      console.log('server is listening on '+options.port);
    });
  } else {
    (new (require('./../index'))(options)).run();
  }
}
