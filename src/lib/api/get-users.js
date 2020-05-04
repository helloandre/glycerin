const { URL_DATA, ACTIONID_GET_USERS } = require('../../../constants');
const request = require('./request');

module.exports = function (data) {
  return request('POST', URL_DATA, {
    'f.req': JSON.stringify([
      [
        [
          ACTIONID_GET_USERS,
          [
            {
              [ACTIONID_GET_USERS]: [
                [],
                null,
                data.map(datum => [
                  [`space/${datum.room.id}`, datum.room.id, 2],
                  [
                    `user/${datum.id}`,
                    null,
                    datum.id,
                    null,
                    [datum.id, `human/${datum.id}`, 0],
                    `user/human/${datum.id}`,
                  ],
                ]),
              ],
            },
          ],
          null,
          null,
          0,
        ],
      ],
    ]),
  }).then(resp => resp[ACTIONID_GET_USERS][1]);
};
