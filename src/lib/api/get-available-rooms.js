const request = require('./request');
const {
  URL_DATA,
  ACTIONID_GET_AVAILABLE_ROOMS,
} = require('../../../constants');

module.exports = function () {
  return request('POST', URL_DATA, {
    'f.req': JSON.stringify([
      [
        [
          ACTIONID_GET_AVAILABLE_ROOMS,
          [{ [ACTIONID_GET_AVAILABLE_ROOMS]: [] }],
          null,
          null,
          0,
        ],
      ],
    ]),
  }).then(resp => resp[ACTIONID_GET_AVAILABLE_ROOMS][0]);
};
