# vrunner

> Runs vREST test cases on terminal.

#### Prerequisites:
* Node.js - Download and Install [Node.js](http://www.nodejs.org/download/). You can also follow this wiki (https://github.com/joyent/node/wiki/installing-node.js-via-package-manager) 

#### Installation: 
	sudo npm install -g vrunner

#### Usage: 
	vrunner --email=<vrest_email> --password=<vrest_password> 
	        --url="<vrest_testcase_list_url>" [--env=<environment_name>]
  	        [--filepath="<path_of_log_file_for_logger_other_than_console>"]
  	        [--logger=<one_of_available_loggers>]

#### Options:
        -E, --email    : Email ID through which you have registered on vREST
        -P, --password : Password of your vREST account
        -U, --url      : Provide the test case list URL here. You can find the test 
                         case list URL by going to your vREST instance and select Test
                         Cases tab. Now click on button "Copy Current Test Case List 
                         URL" available in Left hand side, below the "Filters section". 
                         Provide the copied URL in this option. Ensure that you enclose
                         URL in double quotes.
        -N, --env      : Provide the environment name to initialize the global variables.
                         By default environment `Default` is used.
        -L, --logger   : Your desired logging of the vRUNNER execution process and 
                         result. This can be either `console` or `json` or `xunit`.
                         By default `console` logger is used.
        -F, --filepath : Valid if other than `console` logger is selected.
                         Absolute path of the log file, into which execution process 
                         and result logs will be dumped. If path/file is not present, 
                         tool will try to setup that path, and create file automatically.
                         Please note that if file already exists, that will be 
                         overwritten. By default it will be the `vrest/logs.[json|xml]` 
                         in current directory.
        -H, --help     : To see this help.