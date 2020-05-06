const auth = require('./src/lib/api/auth');
const EE = require('./src/lib/eventemitter');

auth
  .init()
  // all other imports must be inside this function
  // as anything that requires auth will need to happen inside here
  .then(() => {
    const events = require('./src/lib/api/events');
    events();

    if (process.argv[2] === '-e' || process.argv[3] === '-e') {
      EE.on('events.6', evt => {
        console.log(evt);
      });
    } else {
      const Screen = require('./src/screen');
      Screen.bootstrap();
    }
  });
