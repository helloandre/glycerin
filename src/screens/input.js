const blessed = require('neo-blessed');
const EE = require('../lib/eventemitter');
const sendChatMessage = require('../lib/api/send-chat-message');
const sendThreadMessage = require('../lib/api/send-thread-message');
const Chat = require('../lib/model/chat');

const input = blessed.textbox({
  label: 'Input',
  height: '10%+1',
  width: '75%',
  top: '90%',
  left: '25%',
  border: {
    type: 'line',
  },
  cursor: {
    artificial: true,
    shape: 'underline',
    blink: true,
  },
});
input._data = {};

input.on('keypress', (ch, key) => {
  switch (key.full) {
    case 'C-k':
      EE.emit('messages.scroll.up');
      return;
    case 'linefeed':
      EE.emit('messages.scroll.down');
      return;
    case 'C-g':
      EE.emit('messages.scroll.top');
      return;
    case 'C-l':
      EE.emit('messages.scroll.bottom');
      return;
    case 'C-e':
      EE.emit('messages.expand');
      return;
    // these listeners need to be duplicated from screen
    // as input captures keys and doesn't bubble them
    case 'C-r':
      EE.emit('screen.refresh');
      return;
    case 'C-n':
      EE.emit('chats.nextUnread', Chat.nextUnread());
      return;
    case 'C-d':
      process.exit(0);
  }
});

input.on('focus', () => {
  input.readInput(async (err, value) => {
    input.clearValue();
    if (value !== null) {
      if (value.length) {
        if (input._data.from === 'chats') {
          await sendChatMessage(value, input._data.chat);
        } else {
          await sendThreadMessage(value, input._data.thread);
        }
      }

      // input gets a little assume-y on submit
      // so let's give ourselves focus again
      input.focus();
    } else {
      EE.emit('input.blur', input._data.from);
      input._data = false;
    }

    input.screen.render();
  });
});

EE.on('chats.select', chat => {
  if (chat.isDm) {
    input._data = {
      chat,
      from: 'chats',
    };
    input.focus();
    input.screen.render();
  }
});
EE.on('threads.select', thread => {
  input._data = {
    thread,
    from: 'threads',
  };
  input.focus();
  input.screen.render();
});
EE.on('chats.nextUnread', ({ thread }) => {
  if (thread) {
    input._data = {
      thread,
      from: 'threads',
    };
    input.focus();
    input.screen.render();
  }
});

module.exports = {
  input,
};
