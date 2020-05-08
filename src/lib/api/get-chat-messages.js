const { URL_DATA, ACTIONID_GET_CHAT_MESSAGES } = require('../../../constants');
const timestamp = require('../timestamp');
const request = require('./request');

module.exports = function (chat, before) {
  return request('POST', URL_DATA, {
    'f.req': JSON.stringify([
      [
        [
          ACTIONID_GET_CHAT_MESSAGES,
          [
            {
              [ACTIONID_GET_CHAT_MESSAGES]: [
                [`dm/${chat.id}`, chat.id, 5],
                before || timestamp.now(),
                null,
                null,
                null,
              ],
            },
          ],
          null,
          null,
          0,
        ],
      ],
    ]),
  }).then(resp => resp[ACTIONID_GET_CHAT_MESSAGES][0]);
};
