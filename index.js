const auth = require('./src/lib/api/auth');
const EE = require('./src/lib/eventemitter');

auth
  .init()
  // all other imports must be inside this function
  // as anything that requires auth will need to happen inside here
  .then(() => {
    if (process.argv[2] === '-e' || process.argv[3] === '-e') {
      const events = require('./src/lib/api/events');
      const unpack = require('./src/lib/api/unpack');
      process.nextTick(async () => {
        let refresh = true;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          try {
            console.log('connecting', refresh);
            await events(refresh);
            refresh = false;
          } catch (e) {
            console.log('some error');
            refresh = true;
          }
        }
      });
      EE.on('event.*', data => {
        const evts = data[0].map(unpack.event);
        console.log('recieved', evts);
      });
    } else {
      const Screen = require('./src/screen');
      Screen.bootstrap();
    }
  });
