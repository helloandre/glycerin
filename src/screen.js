const blessed = require('neo-blessed');
const EE = require('./lib/eventemitter');

function bootstrap() {
  /**
   * set up our global screen object
   * MUST be done before screens are required for... reasons
   */
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    cursor: {
      shape: 'line',
      blink: true,
    },
  });

  const { chats } = require('./screens/chats');
  const { threads } = require('./screens/threads');
  const { messages } = require('./screens/messages');
  const { input } = require('./screens/input');
  const { search } = require('./screens/search');
  const { confirm } = require('./screens/confirm');
  const { working } = require('./screens/working');

  /**
   * add all our objects to the screen
   */
  screen.append(chats);
  screen.append(threads);
  screen.append(messages);
  screen.append(input);
  screen.append(search);
  screen.append(confirm);
  screen.append(working);

  // initial focus given to sidebar to select a chat room
  chats.focus();

  screen.title = 'GChat TUI';

  screen.key('C-f /', () => EE.emit('search.local'));
  screen.key('C-f f', () => EE.emit('search.remote'));
  screen.key('C-n', async () => EE.emit('unread.next'));
  screen.key('C-d', () => process.exit(0));

  EE.emit('screen.ready');
}

module.exports = {
  bootstrap,
};
