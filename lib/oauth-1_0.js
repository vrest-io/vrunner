var util = require('./util'),
    Base64 = require('crypto-js/enc-base64'),
    HmacSHA1 = require('crypto-js/hmac-sha1');

//http method
function HttpMethodElement(httpMethod) {
    this._httpMethod = httpMethod || '';
}

HttpMethodElement.prototype = {
    get : function () {
        return this._httpMethod.toUpperCase();
    }
};

//oauth parameter loader
var ParametersLoader = function(parameters) {
    this._parameters = { }; // Format: { 'key': ['value 1', 'value 2'] }
    this._loadParameters(parameters || { });
}

ParametersLoader.prototype = {
    _loadParameters : function (parameters) {
        if (parameters instanceof Array) {
            this._loadParametersFromArray(parameters);
            return;
        }
        if (typeof parameters === 'object') {
            this._loadParametersFromObject(parameters);
        }
    },
    _loadParametersFromArray : function (parameters) {
        var i;
        for (i = 0; i < parameters.length; i++) {
            this._loadParametersFromObject(parameters[i]);
        }
    },
    _loadParametersFromObject : function (parameters) {
        var key;
        for (key in parameters) {
            if (parameters.hasOwnProperty(key)) {
                this._loadParameterValue(key, parameters[key] || '');
            }
        }
    },
    _loadParameterValue : function (key, value) {
        var i;
        if (value instanceof Array) {
            for (i = 0; i < value.length; i++) {
                this._addParameter(key, value[i]);
            }
            if (value.length == 0) {
                this._addParameter(key, '');
            }
        } else {
                this._addParameter(key, value);
        }
    },
    _addParameter : function (key, value) {
        if (!this._parameters[key]) {
            this._parameters[key] = [];
        }
        this._parameters[key].push(value);
    },
    get : function () {
        return this._parameters;
    }
};


//oauth parameters handling
var ParametersElement = function(parameters) {
    this._parameters = parameters; // Format: { 'key': ['value 1', 'value 2'] };
    this._sortedKeys = [ ];
    this._normalizedParameters = [ ];
    this._rfc3986 = new Rfc3986();
    this._sortParameters();
    this._concatenateParameters();
}

ParametersElement .prototype = {
    _sortParameters : function () {
        var key;
        for (key in this._parameters) {
            this._sortedKeys.push(key);
        }
        this._sortedKeys.sort();
    },
    _concatenateParameters : function () {
        var i;
        for (i = 0; i < this._sortedKeys.length; i++) {
            this._normalizeParameter(this._sortedKeys[i]);
        }
    },
    _normalizeParameter : function (key) {
        var i,
            values = this._parameters[key],
            encodedKey = this._rfc3986.encode(key),
            encodedValue;
        values.sort();
        for (i = 0; i < values.length; i++) {
            encodedValue = this._rfc3986.encode(values[i]);
            this._normalizedParameters.push(encodedKey + '=' + encodedValue)
        }
    },
    get : function () {
        return this._normalizedParameters.join('&');
    }
};

//rfc 3986
var Rfc3986 = function() {

}

Rfc3986.prototype = {
    encode : function (decoded) {
        if (!decoded) {
            return '';
        }
        // using implementation from: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent?redirectlocale=en-US&redirectslug=JavaScript%2FReference%2FGlobal_Objects%2FencodeURIComponent
        return encodeURIComponent(decoded)
            .replace(/[!'()]/g, escape)
            .replace(/\*/g, "%2A");
    },
    decode : function (encoded) {
        if (!encoded) {
            return '';
        }
        return decodeURIComponent(encoded);
    }
};

// Specification: http://oauth.net/core/1.0/#anchor14
// url: if the scheme is missing, http will be added automatically
var SignatureBaseString = function(httpMethod, url, parameters) {
    this._httpMethod = new HttpMethodElement(httpMethod).get();
    this._url = url;
    parameters = new ParametersLoader(parameters).get();
    this._parameters = new ParametersElement(parameters).get();
    this._rfc3986 = new Rfc3986();
}

SignatureBaseString.prototype = {
    generate : function () {
        // HTTP_METHOD & url & parameters
        return this._rfc3986.encode(this._httpMethod) + '&'
            + this._rfc3986.encode(this._url) + '&'
            + this._rfc3986.encode(this._parameters);
    }
};

var HmacSha1Signature = function(signatureBaseString, consumerSecret, tokenSecret) {
    this._rfc3986 = new Rfc3986();
    this._text = signatureBaseString;
    this._key = this._rfc3986.encode(consumerSecret) + '&' + this._rfc3986.encode(tokenSecret);
    this._base64EncodedHash = new HmacSha1(this._text, this._key).getBase64EncodedHash();
}

HmacSha1Signature.prototype = {
    generate : function () {
        return this._rfc3986.encode(this._base64EncodedHash);
    }
};

var HmacSha1 = function(text, key) {
    this._text = text || '';
    this._key = key || '';
    this._hash = HmacSHA1(this._text, this._key);
}

HmacSha1.prototype = {
    getBase64EncodedHash : function () {
        return Base64.stringify(this._hash);
    }
};

var OAuth = function(config, method, url){

    this.oauthVersion = '1.0';
    this.config = config;
    this.signatureMethod = (config.signatureMethod && config.signatureMethod.toUpperCase()) || 'HMAC-SHA1';
    this.consumerKey = config.consumerKey;
    this.consumerSecret = config.consumerSecret;
    this.accessTokenKey = config.accessTokenKey || '';
    this.accessTokenSecret = config.accessTokenSecret || '';
    this.verifier = config.oauthVerifier;
    this.scope = config.scope;

    this.method = method.toUpperCase();
    this.url = url;

    this.nonce = this.getNonce();
    this.timestamp = this.getTimestamp();

    this.parameters = this.loadParameters();
    if(url.indexOf("?") != -1){
        this.baseURL = url.substring(0, url.indexOf("?"));
    } else {
        this.baseURL = url;
    }
};

OAuth.prototype = {
    getTimestamp: function(){
        return parseInt(+new Date() / 1000, 10);
    },

    getNonce: function(keyLength){

        keyLength = keyLength || 64;

        var key_bytes = keyLength / 8, value = '', key_iter = key_bytes / 4,
            key_remainder = key_bytes % 4, i,
            chars = ['20', '21', '22', '23', '24', '25', '26', '27', '28', '29',
                     '2A', '2B', '2C', '2D', '2E', '2F', '30', '31', '32', '33',
                     '34', '35', '36', '37', '38', '39', '3A', '3B', '3C', '3D',
                     '3E', '3F', '40', '41', '42', '43', '44', '45', '46', '47',
                     '48', '49', '4A', '4B', '4C', '4D', '4E', '4F', '50', '51',
                     '52', '53', '54', '55', '56', '57', '58', '59', '5A', '5B',
                     '5C', '5D', '5E', '5F', '60', '61', '62', '63', '64', '65',
                     '66', '67', '68', '69', '6A', '6B', '6C', '6D', '6E', '6F',
                     '70', '71', '72', '73', '74', '75', '76', '77', '78', '79',
                     '7A', '7B', '7C', '7D', '7E'],
            rand = function() {
                return Math.floor(Math.random() * chars.length);
            };

        for (i = 0; i < key_iter; i++) {
            value += chars[rand()] + chars[rand()] + chars[rand()]+ chars[rand()];
        }

        // handle remaining bytes
        for (i = 0; i < key_remainder; i++) {
            value += chars[rand()];
        }

        return value;
    },

    getQueryString: function(){
        if(this.url.indexOf('?') > -1){
            return this.url.substring(this.url.indexOf("?") + 1);
        }
        return '';
    },

    loadParameters: function(){
        var params = util.parseQuery(this.url),
            param;
        if(this.postParameters){
            for(param in this.postParams){
                params[param] = this.postParams[param];
            }
        }

        params.oauth_consumer_key = this.consumerKey;
        params.oauth_token = this.accessTokenKey;
        params.oauth_nonce = this.nonce;
        params.oauth_timestamp = this.timestamp;
        params.oauth_signature_method = this.signatureMethod;
        params.oauth_version = this.oauthVersion;
        if(this.scope){
            params.oauth_scope = this.scope;
        }
        if(this.verifier){
            params.oauth_verifier = this.verifier;
        }
        return params;
    },

    sign: function(signatureBaseString){
        if(this.signatureMethod === "HMAC-SHA1"){
            return new HmacSha1Signature(signatureBaseString, this.consumerSecret, this.accessTokenSecret).generate();
        } else {
            throw Error('Signature Method "' + this.signatureMethod + '" not supported.');
        }
    },

    getAuthHeader: function(){

        var signatureBaseString = new SignatureBaseString(this.method, this.baseURL, this.parameters).generate();
        var signature = this.sign(signatureBaseString);
        var header = 'OAuth oauth_consumer_key="' + this.consumerKey + '",oauth_signature_method="' + this.signatureMethod +
            '",oauth_timestamp="' + this.timestamp + '",oauth_nonce="' + this.nonce + '",oauth_version="' + this.oauthVersion +
            '",oauth_token="'+ this.accessTokenKey + '",oauth_signature="' + signature + '"';

        if(this.scope){
            header += ',oauth_scope="' + this.scope + '"';
        }
        if(this.verifier){
            header += ',oauth_verifier="' + this.verifier + '"';
        }
        return header;
    }
};

module.exports = OAuth;
