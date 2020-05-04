const {
  URL_MUTATE,
  ACTIONID_SEND_THREAD_MESSAGE,
} = require('../../../constants');
const randomId = require('../random-id');
const request = require('./request');

module.exports = function (msg, thread) {
  const msgId = randomId(11);
  return request('POST', URL_MUTATE, {
    'f.req': JSON.stringify([
      'af.maf',
      [
        [
          'af.add',
          ACTIONID_SEND_THREAD_MESSAGE,
          [
            {
              [ACTIONID_SEND_THREAD_MESSAGE]: [
                msgId,
                [`space/${thread.room.id}`, thread.room.id, 2],
                thread.id,
                null,
                null,
                msg,
                [],
                [
                  msgId,
                  null,
                  [
                    thread.id,
                    null,
                    [`space/${thread.room.id}`, thread.room.id, 2],
                  ],
                ],
              ],
            },
          ],
        ],
      ],
    ]),
  });
};
