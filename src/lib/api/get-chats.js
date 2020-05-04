const request = require('./request');
const { URL_DATA, ACTIONID_GET_CHATS } = require('../../../constants');

module.exports = function () {
  return request('POST', URL_DATA, {
    'f.req': JSON.stringify([
      [
        [
          ACTIONID_GET_CHATS,
          [
            {
              [ACTIONID_GET_CHATS]: [null, [], []],
            },
          ],
          null,
          null,
          0,
        ],
      ],
    ]),
  }).then(resp => resp[ACTIONID_GET_CHATS]);
};
