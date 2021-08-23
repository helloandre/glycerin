const blessed = require('neo-blessed');
const EE = require('../lib/eventemitter');
const State = require('../lib/state');
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
// input.key('C-p', () => {
//   if (input._data.chat.isDm) {
//     const curr = history();
//     config.set(`history.${input._data.chat.id}`, !curr);
//     input.setLabel(`Input (history: ${!curr ? 'on' : 'off'})`);
//     input.screen.render();
//   }
// });

// these listeners need to be duplicated from screen
// as input captures keys and doesn't bubble them
// input.key('C-f /', () => EE.emit('search.local'));
// input.key('C-f f', () => EE.emit('search.remote'));
input.key('C-n', async () => EE.emit('unread.next'));
input.key('C-d', () => process.exit(0));

input.on('focus', () => {
  const chat = State.chat();
  // if (chat.isDm) {
  //   input.setLabel(`Input (history: ${history() ? 'on' : 'off'})`);
  // }

  input.readInput((_, value) => {
    input.clearValue();
    if (value !== null) {
      if (value.length) {
        // fire and forget these
        // we get an event when the message is sent
        if (chat.isDm) {
          // sendChatMessage(value, chat, history());
          // TODO figure out where in the protocol is history stored
          sendChatMessage(value, chat);
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

EE.on('input.focus', () => {
  input.focus();
  input.screen.render();
});

module.exports = {
  input,
};
