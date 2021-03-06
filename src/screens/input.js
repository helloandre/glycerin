const blessed = require('neo-blessed');
const EE = require('../lib/eventemitter');
const sendChatMessage = require('../lib/api/send-chat-message');
const sendThreadMessage = require('../lib/api/send-thread-message');
const createThread = require('../lib/api/create-thread');
const Chat = require('../lib/model/chat');
const config = require('../lib/config');

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

function history() {
  return config.get(`history.${input._data.chat.id}`, false);
}

input.key('C-k', () => EE.emit('messages.scroll.up'));
input.key('linefeed', () => EE.emit('messages.scroll.down'));
input.key('C-g', () => EE.emit('messages.scroll.top'));
input.key('C-l', () => EE.emit('messages.scroll.bottom'));
input.key('C-e', () => EE.emit('messages.expand'));
input.key('C-p', () => {
  if (input._data.chat.isDm) {
    const curr = history();
    config.set(`history.${input._data.chat.id}`, !curr);
    input.setLabel(`Input (history: ${!curr ? 'on' : 'off'})`);
    input.screen.render();
  }
});

// these listeners need to be duplicated from screen
// as input captures keys and doesn't bubble them
input.key('C-f /', () => EE.emit('search.local'));
input.key('C-f f', () => EE.emit('search.remote'));
input.key('C-n', async () =>
  EE.emit('chats.nextUnread', await Chat.nextUnread())
);
input.key('C-d', () => process.exit(0));

input.on('focus', () => {
  if (input._data.chat.isDm) {
    input.setLabel(`Input (history: ${history() ? 'on' : 'off'})`);
  }
  input.readInput((err, value) => {
    input.clearValue();
    if (value !== null) {
      if (value.length) {
        // fire and forget these
        // we get an event when the message is sent
        if (input._data.from === 'chats') {
          sendChatMessage(value, input._data.chat, history());
        } else if (input._data.new) {
          createThread(value, input._data.chat);
        } else {
          sendThreadMessage(value, input._data.thread);
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
input.on('blur', () => {
  input.setLabel(`Input`);
});

EE.on('threads.new', chat => {
  input._data = {
    chat,
    new: true,
    from: 'threads',
  };
  input.focus();
  input.screen.render();
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
EE.on('chats.nextUnread', chat => {
  if (chat) {
    input._data = chat.room
      ? {
          thread: chat,
          from: 'threads',
        }
      : {
          chat,
          from: 'chats',
        };
    input.focus();
    input.screen.render();
  }
});
EE.on('messages.new', ({ thread }) => {
  // we just created a new thread, need to update our info
  if (input._data.new) {
    input._data = {
      thread,
      from: 'threads',
    };
  }
});
EE.on('search.preview', chat => {
  input.setValue(`press "enter" again to join "${chat.displayName}"`);
  input.screen.render();
});
EE.on('threads.blur', found => {
  input.clearValue();
  input.screen.render();
});

module.exports = {
  input,
};
