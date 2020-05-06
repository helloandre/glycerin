const https = require('https');
const qs = require('qs');
const auth = require('./auth');
const parse = require('./parse');
const EE = require('../eventemitter');
const { URL_EVENTS, DEFAULT_HEADERS } = require('../../../constants');
const unpack = require('./unpack');

let AID = 0;

/**
 * Long poll for events to come in and update the chat
 * NOTE: there should only ever be one events() call running at a time
 *
 * @see auth.register()
 * @see auth.eventsData()
 *
 * @param {Boolean} [refresh] default: false - force a re-register
 *
 * @return {Promise}
 */
module.exports = function () {
  process.nextTick(async () => {
    let refresh = true;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        await longPoll(refresh);
        refresh = false;
      } catch (e) {
        EE.emit('events.error', e);
        refresh = true;
      }
    }
  });
};

async function longPoll(refresh = false) {
  if (refresh) {
    AID = 0;
  }

  const { SID, cookie } = await auth.eventsData(refresh);

  return new Promise(resolve => {
    https
      .get(
        URL_EVENTS +
          '?' +
          qs.stringify({
            RID: 'rpc',
            SID,
            AID, // ID of the last message from the previous /events call
          }),
        {
          headers: {
            ...DEFAULT_HEADERS,
            cookie,
          },
        },
        response => {
          response.setEncoding('utf8');

          let data = '';
          response.on('data', chunk => {
            data += chunk.toString();

            try {
              const parsed = parse.fromEvents(data);
              parsed[0].map(unpack.event).forEach(evt => {
                EE.emit(`events.${evt._type}`, evt);
                EE.emit(`events.*`, evt);
              });
              AID = parsed[0][parsed[0].length - 1][0];

              data = '';
            } catch (e) {
              // console.log(e, data);
              // can be expected as chunks aren't always complete json,
              // just keep going, we'll append more data next time around
            }
          });
          response.on('end', () => resolve());
        }
      )
      .on('error', e => {
        console.log(e);
      });
  });
}
