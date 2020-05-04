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
  const threadId = randomId(11);
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
                [`space/${room.id}`, room.id, 2],
                msg,
                [],
                threadId,
                [1],
                null,
                threadId,
                true,
              ],
            },
          ],
        ],
      ],
    ]),
  });
};
