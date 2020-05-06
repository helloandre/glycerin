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
  // const { search } = require('./screens/search');

  /**
   * add all our objects to the screen
   */
  screen.append(chats);
  screen.append(threads);
  screen.append(messages);
  screen.append(input);
  // screen.append(search);

  // initial focus given to sidebar to select a chat room
  chats.focus();

  screen.title = 'GChat TUI';
  screen.on('keypress', async (ch, key) => {
    switch (key.full) {
      case 'C-d':
        return process.exit(0);
      case 'C-r':
        return EE.emit('screen.refresh');
      case 'C-n':
        return EE.emit('chats.nextUnread', await Chat.nextUnread());
    }
  });

  screen.getChats = () => screen.children[0];
  screen.getThreads = () => screen.children[1];
  screen.getMessages = () => screen.children[2];
  screen.getInput = () => screen.children[3];
  // screen.getSearch = () => screen.children[4];

  EE.emit('screen.ready');
}

module.exports = {
  bootstrap,
};
