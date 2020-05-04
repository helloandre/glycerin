const request = require('./request');
const {
  URL_DATA,
  ACTIONID_GET_THREAD_MESSAGES,
} = require('../../../constants');

module.exports = function (thread) {
  return request('POST', URL_DATA, {
    'f.req': JSON.stringify([
      [
        [
          ACTIONID_GET_THREAD_MESSAGES,
          [
            {
              [ACTIONID_GET_THREAD_MESSAGES]: [
                [
                  thread.id,
                  null,
                  [`space/${thread.room.id}`, thread.room.id, 2],
                ],
              ],
            },
          ],
          null,
          null,
          0,
        ],
      ],
    ]),
  }).then(resp => resp[ACTIONID_GET_THREAD_MESSAGES][0]);
};
