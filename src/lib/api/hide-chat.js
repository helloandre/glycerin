const { URL_MUTATE, ACTIONID_HIDE_CHAT } = require('../../../constants');
const request = require('./request');

module.exports = chat =>
  request('POST', URL_MUTATE, {
    'f.req': JSON.stringify([
      'af.maf',
      [
        [
          'af.add',
          ACTIONID_HIDE_CHAT,
          [{ [ACTIONID_HIDE_CHAT]: [[chat.uri, chat.id, 5], true] }],
        ],
      ],
    ]),
  }).then(resp => resp[0][0][1][ACTIONID_HIDE_CHAT]);
