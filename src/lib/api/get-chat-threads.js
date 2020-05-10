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
        null,
        null,
        [],
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
  }).then(resp => resp[ACTIONID_GET_CHAT_THREADS][0]);
  // resp has some other metadata, but don't know what it is quite yet
};
