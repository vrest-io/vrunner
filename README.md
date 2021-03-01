# vrunner

1. Executes test cases on terminal which are stored in [vREST Cloud](https://cloud.vrest.io).
2. vrunner command can be used in any third party schedular like cron to schedule test cases. For more information, please read our [guide](https://docs.optimizory.com/x/wJGz).
3. vrunner command can be used in any continuous integration server like Jenkins etc. For more information, please read our [guide](https://docs.optimizory.com/x/HAGq).

#### Prerequisites:
* Node.js - Download and Install [Node.js](https://nodejs.org/en/download/). You can also follow this wiki (https://nodejs.org/en/download/package-manager/)

#### Installation / Update:
	sudo npm install -g vrunner

* sudo is optional. For windows, remove sudo from the above command.

#### Usage:
	vrunner --email=<vrest_email> --password=<vrest_password>
	        --url="<vrest_testcase_list_url>" [--env=<environment_name>]
            [--nosslcheck=<boolean_value>] [--debug=<boolean_value>] [--logger=<one_of_available_loggers>]
  	        [--filepath="<path_of_log_file_for_logger_other_than_console>"]

#### Options:
        -E, --email      : Email ID through which you have registered on vREST
        -P, --password   : Password of your vREST account
        -U, --url        : Provide the test case list URL here. You can find the test
                           case list URL by going to your vREST instance and select Test
                           Cases tab. Now click on button "Copy Current Test Case List
                           URL" available in Left hand side, below the "Filters section".
                           Provide the copied URL in this option. Ensure that you enclose
                           URL in double quotes.
        -N, --env        : Provide the environment name to initialize the global variables.
                           By default environment `Default` is used.
        -D, --debug      : Should be set if you want debugging console logs.
                           By default debugging information are not logged.
        -S, --nosslcheck : If this argument is `true`, vRUNNER will process all requests,
                           without Secure Certificate Check.
                           By default Secure Certificate Check is enabled. This option is
                           useful in self-signed certificate issues.
        -L, --logger     : Your desired logging of the vRUNNER execution process and
                           result. This can be either `console` or `json` or `csv` or `xunit`.
                           By default `console` logger is used.
        -F, --filepath   : Valid if other than `console` logger is selected.
                           Absolute path of the log file, into which execution process
                           and result logs will be dumped. If path/file is not present,
                           tool will try to setup that path, and create file automatically.
                           Please note that if file already exists, that will be
                           overwritten. By default it will be the `vrest_logs/logs.[json|xml|csv]`
                           in current directory.
        -H, --help       : To see this help.
