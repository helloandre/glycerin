const {
  URL_DATA,
  ACTIONID_MARK_THREAD_READ,
  ACTIONID_MARK_DM_READ,
} = require('../../../constants');
const request = require('./request');
const { now } = require('../timestamp');

module.exports = function (obj) {
  const actionId = obj.isDm ? ACTIONID_MARK_DM_READ : ACTIONID_MARK_THREAD_READ;
  const payload = obj.isDm
    ? [obj.uri, obj.id, 5]
    : [obj.id, null, [obj.room.uri, obj.room.id, 2]];

  return request('POST', URL_DATA, {
    'f.req': JSON.stringify([
      [
        [
          actionId,
          [
            {
              [actionId]: [payload, now()],
            },
          ],
          null,
          null,
          0,
        ],
      ],
    ]),
  }).then(res => res[actionId]);
};
