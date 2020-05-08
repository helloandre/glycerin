const { URL_DATA, ACTIONID_GET_CHAT_THREADS } = require('../../../constants');
const request = require('./request');

module.exports = function (chat, before) {
  return request('POST', URL_DATA, {
    'f.req': JSON.stringify([
      [
        [
          ACTIONID_GET_CHAT_THREADS,
          [
            {
              [ACTIONID_GET_CHAT_THREADS]: [
                [`space/${chat.id}`, chat.id, 2],
                null,
                null,
                null,
                null,
                null,
                null,
                before,
                null,
                false,
                true,
                null,
                null,
                null,
                [],
              ],
            },
          ],
          null,
          null,
          0,
        ],
      ],
    ]),
  }).then(resp => resp[ACTIONID_GET_CHAT_THREADS][0]);
  // resp has some other metadata, but don't know what it is quite yet
};
