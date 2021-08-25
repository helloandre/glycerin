const { URL_DATA, ACTIONID_GET_CHAT_THREADS } = require('../../../constants');
const request = require('./request');

module.exports = function (chat, before, preview = false) {
  const param = preview
    ? [[chat.uri, chat.id, 2], true, null, null, true, null, true]
    : [
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
        false,
        null,
        [1, false],
        false,
        false,
      ];
  return request('POST', URL_DATA, {
    'f.req': JSON.stringify([
      [
        [
          ACTIONID_GET_CHAT_THREADS,
          [
            {
              [ACTIONID_GET_CHAT_THREADS]: param,
            },
          ],
          null,
          null,
          0,
        ],
      ],
    ]),
  }).then(resp => resp[ACTIONID_GET_CHAT_THREADS]);
};
