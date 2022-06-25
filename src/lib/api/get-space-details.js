const request = require('./request-batch');
const { RPCID_GET_SPACE_DETAILS } = require('../../../constants');

module.exports = function (chat) {
  return request({
    'f.req': JSON.stringify([
      [
        [
          RPCID_GET_SPACE_DETAILS,
          JSON.stringify([[chat.uri, chat.id, 2]]),
          null,
          '2',
        ],
      ],
    ]),
  }).then(resp => resp[0][0]);
};
