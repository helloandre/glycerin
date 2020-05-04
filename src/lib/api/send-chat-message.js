const {
  URL_MUTATE,
  ACTIONID_SEND_CHAT_MESSAGE,
} = require('../../../constants');
const randomId = require('../random-id');
const request = require('./request');

/**
 * @param {String} msg
 * @param {Object} room
 * @param {Boolean} [history] default: false
 *
 * @return {Promise}
 */
module.exports = function (msg, room, history = false) {
  const msgId = randomId(11);

  return request('POST', URL_MUTATE, {
    'f.req': JSON.stringify([
      'af.maf',
      [
        [
          'af.add',
          // shrug
          parseInt(ACTIONID_SEND_CHAT_MESSAGE, 10),
          [
            {
              [ACTIONID_SEND_CHAT_MESSAGE]: [
                [`dm/${room.id}`, room.id, 5],
                msg,
                [],
                msgId,
                // 1 = history on
                // 2 = history off
                [history ? 1 : 2],
                null,
                msgId,
                true,
              ],
            },
          ],
        ],
      ],
    ]),
  });
};
