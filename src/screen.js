const blessed = require('neo-blessed');
const EE = require('./lib/eventemitter');
const Chat = require('./lib/model/chat');

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
  screen.on('keypress', async (ch, key) => {
    switch (key.full) {
      case 'C-f':
        return EE.emit('search.local');
      case 'C-o':
        return EE.emit('search.remote');
      case 'C-d':
        return process.exit(0);
      case 'C-r':
        return EE.emit('screen.refresh');
      case 'C-n':
        return EE.emit('chats.nextUnread', await Chat.nextUnread());
    }
  });

  EE.emit('screen.ready');
}

module.exports = {
  bootstrap,
};
