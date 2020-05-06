const axios = require('axios');
const qs = require('qs');
const parse = require('./parse');
const auth = require('./auth');
const { DEFAULT_HEADERS } = require('../../../constants');

const DEFAULT_PARAMS = {
  rt: 'c',
};

/**
 *
 * @param {String} method
 * @param {String} url
 * @param {Object} [data] default: {}
 * @param {Object} [params] default: {}
 * @param {Object} [headers] default: {}
 */
module.exports = function (method, url, data = {}, params = {}, headers = {}) {
  const { at, cookie } = auth.requestData();
  return axios({
    method,
    url,
    data: qs.stringify({
      at,
      ...data,
    }),
    params: {
      ...DEFAULT_PARAMS,
      ...params,
    },
    headers: {
      ...DEFAULT_HEADERS,
      cookie,
      ...headers,
    },
  })
    .then(({ data }) => {
      const resp = parse.fromResponse(data);
      return resp[0][0][2] ? resp[0][0][2] : resp;
    })
    .catch(e => {
      console.log(e);
      return e.response.data;
    });
};
