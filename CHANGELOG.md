# Changelog

All major/minor version changes to this project will be documented in this file.
## [0.4.0] - 2019-09-25

### Improvements

- vrunner now automatically handles gzip responses using option --gzip.

## [0.3.8] - 2019-06-27

### Improvements

- vrunner now handles exceptional conditions of assertions during response validation.

## [0.3.6] - 2017-07-21

### Improvements

- vrunner now supports modifiers (e.g. ignore case through modifier `i`) in regular expressions used in Expected Body and assertions.

## [0.3.5] - 2017-07-07

### Bug Fixes

- vrunner now resets the cookie if the custom cookie is set in the test case.
- vurnner now stores all the request headers in execution time details which are being sent by vrunner apart from the headers which user has set in the test case.

## [0.3.1] - 2017-03-10

### Added

- XML Validation now supports special variable **STAR_VAR**.

## [0.2.45] - 2017-02-10

### Added

- Environment specific authorization functionality implemented.

## [0.2.44] - 2017-01-09

### Changed

- Test Suite filter related bug resolved.

## [0.2.43] - 2017-11-24

### Changed

- vrunner JSON report updated. Now JSON report includes assertion results summary as well.

### Bug Fixes

- Fixed bug related to assertion results data stored on server via vrunner

## [0.2.42] - 2017-11-18 (Discontinued due to assertion results data bug)

### Changed

- vrunner JSON report updated. Now JSON report includes assertion results as well.

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
