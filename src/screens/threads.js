const blessed = require('neo-blessed');
const format = require('../lib/format');
const Chat = require('../lib/model/chat');
const EE = require('../lib/eventemitter');

const threads = blessed.list({
  label: 'Threads',
  left: '25%',
  height: '25%',
  width: '75%',
  tags: true,
  border: {
    type: 'line',
  },
  items: ['Select A Room'],
  mouse: true,
  keys: true,
  vi: true,
});
threads._data = {};
threads.thread = function () {
  return threads._data.threads[threads.selected];
};

async function display(refresh = false) {
  threads.setItems(['Loading...']);
  threads.screen.render();

  const ts = await Chat.threads(threads._data.chat, refresh);
  threads._data.threads = [];
  const formatted = [];
  // eslint-disable-next-line no-unused-vars
  for (let [id, thread] of Object.entries(ts)) {
    formatted.push(await format.thread(thread));
    threads._data.threads.push(thread);
  }

  threads.setItems(formatted);
  threads.select(formatted.length - 1);
  threads.scrollTo(formatted.length - 1);

  threads.screen.render();
}

threads.on('focus', () => {
  threads.style.selected = {
    fg: 'white',
    bg: 'grey',
  };
  threads.style.item = {
    fg: 'white',
  };
});
threads.on('blur', () => {
  if (threads._data) {
    threads.style.selected = {
      fg: 'black',
      bg: 'grey',
    };
    threads.style.item = {
      fg: 'grey',
    };
  }
  threads.screen.render();
});
threads.on('select item', () => {
  if (threads._data) {
    EE.emit('threads.preview', threads.thread());
  }
});

threads.key(['enter'], () => {
  threads.style.selected = {
    fg: 'black',
    bg: 'grey',
  };
  threads.style.item = {
    fg: 'grey',
  };

  EE.emit('threads.select', threads.thread());
  threads.screen.render();
});
threads.key(['escape'], () => {
  threads.style.selected = {
    fg: 'white',
    bg: undefined,
  };
  threads._data = undefined;
  threads.setItems(['Select A Room']);
  EE.emit('threads.blur');
});
threads.key('C-e', function () {
  EE.emit('messages.expand');
});

EE.on('chats.select', chat => {
  if (!chat.isDm) {
    threads._data = { chat };
    display();

    threads.focus();
  }
});
EE.on('input.blur', from => {
  if (from === 'threads') {
    threads.focus();
  }
});
EE.on('screen.refresh', () => {
  if (threads._data && threads._data.chat) {
    display(true);
  }
});

module.exports = {
  threads,
};
