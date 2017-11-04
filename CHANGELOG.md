# Changelog
All major/minor version changes to this project will be documented in this file.

## [0.2.41] - 2017-11-04
### Changed
- vrunner xunit report updated according to [JUnit-10 XSD](https://github.com/jenkinsci/xunit-plugin/blob/master/src/main/resources/org/jenkinsci/plugins/xunit/types/model/xsd/junit-10.xsd) formmat.
- vrunner xunit report now supports Confluence JUnit report except bug [CONFSERVER-52364](https://jira.atlassian.com/browse/CONFSERVER-52364)

## [0.2.40] - 2017-10-28
### Added
- Added properties executionSource and environment for the test run.

## [0.2.39] - 2017-10-24
### Changed
- vrunner xunit report's top element changed from testrun to testsuites.
- vrunner xunit report now supports TeamCity.

## [0.2.38] - 2017-10-23
### Added
- Added functionality in authorizations to automate the process of renewing access tokens using refresh tokens.