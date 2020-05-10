const { URL_DATA, ACTIONID_WHOAMI } = require('../../../constants');
const request = require('./request');

module.exports = function () {
  return request('POST', URL_DATA, {
    'f.req': JSON.stringify([
      [[ACTIONID_WHOAMI, [{ [ACTIONID_WHOAMI]: [] }], null, null, 0]],
    ]),
  }).then(resp => resp[ACTIONID_WHOAMI][0]);
  // resp has some other metadata, but don't know what it is quite yet
};
