const { docopt } = require('docopt');
const auth = require('./src/lib/api/auth');
const EE = require('./src/lib/eventemitter');
// all other imports must be inside auth.init().then() function
// as anything that requires auth will need to happen inside here

const doc = `
Glycerin - Google Chat Terminal User Interface

Usage:
  gln [options]
  gln leave [--auth]
  gln run [options] <req>
  gln func

Options:
  -h --help       Show This Message
  -a --auth       Force reauthenticate with Firefox
  -e --events     Do not start a UI, instead print events stream. Overrides all other actions.
`;

const opts = docopt(doc);
auth.init(opts).then(() => {
  const events = require('./src/lib/api/events');

  if (opts.func) {
    // const getAvailableRooms = require('./src/lib/api/get-available-rooms');
    // const getChats = require('./src/lib/api/get-chats');
    // const getSpaceDetails = require('./src/lib/api/get-space-details');
    const Chat = require('./src/lib/model/chat');
    // const unpack = require('./src/lib/api/unpack');
    const format = require('./src/lib/format');

    // getSpaceDetails({ uri: 'space/AAAAsCC42fA', id: 'AAAAsCC42fA' }).then(
    //   d => {
    //     console.log(JSON.stringify(unpack.threads(d), null, 2));
    //   }
    // );
    //chat.google.com/room/AAAAoxNPLX8/T51Q_Qp8rZA
    https: Chat.fetchThreads({
      uri: 'space/AAAAsCC42fA',
      id: 'AAAAsCC42fA',
    }).then(d => {
      Chat.fetchMessages(d.threads[4])
        .then(m => Promise.all(m.map(x => format.message(x))))
        .then(ms => ms.forEach(m => console.log(m)));
      // console.log(d);
    });
  } else if (opts['--events']) {
    events();
    EE.on('events.*', evt => {
      console.log(JSON.stringify(evt, null, 2));
    });
  } else if (opts.leave) {
    const Prune = require('./src/screens/prune');
    Prune.bootstrap();
  } else if (opts.run) {
    const req = require('./src/lib/api/request');
    const { URL_DATA } = require('./constants');
    req('POST', URL_DATA, { 'f.req': opts['<req>'] }).then(resp =>
      console.log(JSON.stringify(resp, null, 2))
    );
  } else {
    events();
    const Screen = require('./src/screen');
    Screen.bootstrap();
  }
});
