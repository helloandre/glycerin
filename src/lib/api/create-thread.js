const { URL_MUTATE, ACTIONID_CREATE_THREAD } = require('../../../constants');
const randomId = require('../random-id');
const request = require('./request');

/**
 * WARNING: not tested
 *
 * @param {String} msg
 * @param {Object} room
 */
module.exports = function (msg, room) {
  // threads take their id from the first message id
  // so this is doing double duty
  const msgId = randomId(11);
  return request('POST', URL_MUTATE, {
    'f.req': JSON.stringify([
      'af.maf',
      [
        [
          'af.add',
          ACTIONID_CREATE_THREAD,
          [
            {
              [ACTIONID_CREATE_THREAD]: [
                [room.uri, room.id, 2],
                msg,
                [],
                msgId,
                [1],
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
