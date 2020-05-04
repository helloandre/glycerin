const axios = require('axios');
const qs = require('qs');
const parse = require('./parse');
const auth = require('./auth');
const { DEFAULT_HEADERS } = require('../../../constants');

const DEFAULT_PARAMS = {
  rt: 'c',
};
/**
 * @TODO warning, this "at" param is magic
 * it has a timestamp, but the prefix seems to need to match the timestamp
 * I don't *think* this is a meaninful secret on it's own, so is ok to include in git?
 */
const AT = 'AM9aX1FUPXhHY1aNDL2U948ldv4Y:1588518881495';

/**
 *
 * @param {String} method
 * @param {String} url
 * @param {Object} [data] default: {}
 * @param {Object} [params] default: {}
 * @param {Object} [headers] default: {}
 */
module.exports = function (method, url, data = {}, params = {}, headers = {}) {
  return axios({
    method,
    url,
    data: qs.stringify({
      at: AT,
      ...data,
    }),
    params: {
      ...DEFAULT_PARAMS,
      ...params,
    },
    headers: {
      ...DEFAULT_HEADERS,
      cookie: auth.requestCookie(),
      ...headers,
    },
  })
    .then(({ data }) => parse.fromResponse(data)[0][0][2])
    .catch(e => {
      console.log(e);
      return e.response.data;
    });
};
