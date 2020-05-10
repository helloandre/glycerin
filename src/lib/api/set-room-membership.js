const {
  URL_DATA,
  ACTIONID_SET_ROOM_MEMBERSHIP,
} = require('../../../constants');
const request = require('./request');

module.exports = function (chat, user, join = true) {
  const action = join ? 2 : 3; // hooray magic values!
  return request('POST', URL_DATA, {
    'f.req': JSON.stringify([
      [
        [
          ACTIONID_SET_ROOM_MEMBERSHIP,
          [
            {
              [ACTIONID_SET_ROOM_MEMBERSHIP]: [
                [],
                [chat.uri, chat.id, 2],
                action,
                [
                  [
                    `user/${user.id}`,
                    null,
                    user.id,
                    null,
                    [user.id, `human/${user.id}`, 0],
                    `user/human/${user.id}`,
                  ],
                ],
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
  }).then(resp => resp[ACTIONID_SET_ROOM_MEMBERSHIP][0]);
  // resp has some other metadata, but don't know what it is quite yet
};
