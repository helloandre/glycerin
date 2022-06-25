const axios = require('axios');
const qs = require('qs');
const { fromBatchExecute } = require('./parse');
const auth = require('./auth');
const { DEFAULT_HEADERS, URL_BATCHEXECUTE } = require('../../../constants');

/**
 *
 * @param {String} method
 * @param {String} url
 * @param {Object} [data] default: {}
 * @param {Object} [params] default: {}
 * @param {Object} [headers] default: {}
 */
module.exports = function (data = {}) {
  const { at, cookie } = auth.requestData();
  return axios({
    method: 'POST',
    url: URL_BATCHEXECUTE,
    data: qs.stringify({
      at,
      ...data,
    }),
    headers: {
      ...DEFAULT_HEADERS,
      cookie,
    },
  })
    .then(({ data }) => fromBatchExecute(data))
    .catch(e => {
      console.log(e);
      return e.response.data;
    });
};
