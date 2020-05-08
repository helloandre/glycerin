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
  // mouse: true,
  // keys: true,
  // vi: true,
});
threads._data = {};
threads.thread = function () {
  return threads._data.threads[threads.selected];
};

async function display(selectLast = true) {
  const formatted = [];
  // eslint-disable-next-line no-unused-vars
  for (let thread of threads._data.threads) {
    formatted.push(await format.thread(thread));
  }

  threads.setItems(formatted);
  if (selectLast) {
    threads.select(formatted.length - 1);
    threads.screen.render();
  }
}

async function up() {
  if (threads.selected === 0) {
    const origLen = threads._data.threads.length;
    threads.unshiftItem(format.placehold());
    threads.screen.render();

    threads._data.threads = await Chat.moreThreads(threads._data.chat);
    await display(false);
    // highlight the oldest most-recently-loaded thread
    threads.select(threads._data.threads.length - origLen - 1);
    threads.screen.render();
  } else {
    threads.up();
    threads.screen.render();
  }
}

threads.on('keypress', (ch, key) => {
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
    case 'up':
    case 'k':
      up();
      return;
    case 'down':
    case 'j':
      threads.down();
      threads.screen.render();
      return;
    case 'g':
      threads.select(0);
      threads.screen.render();
      return;
    case 'S-g':
      threads.select(threads.items.length - 1);
      threads.screen.render();
      return;
    case 'enter':
    case 'right':
    case 'v':
      threads.style.selected = {
        fg: 'black',
        bg: 'grey',
      };
      threads.style.item = {
        fg: 'grey',
      };
      EE.emit('threads.select', threads.thread());
      return;
    case 'escape':
    case 'left':
    case 'q':
      threads.screen.render();
      threads.style.selected = {
        fg: 'white',
        bg: undefined,
      };
      threads._data = {};
      threads.setItems(['Select A Room']);
      EE.emit('threads.blur');
      return;
  }
});
threads.on('focus', () => {
  threads.style.selected = {
    fg: 'white',
    bg: 'grey',
  };
  threads.style.item = {
    fg: 'white',
  };
  threads.screen.render();
});
threads.on('blur', () => {
  if (threads._data.chat) {
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
  if (threads._data.chat) {
    EE.emit('threads.preview', threads.thread());
  }
});
EE.on('chats.select', async chat => {
  if (!chat.isDm) {
    threads.focus();
    threads.setItems(['Loading...']);
    threads.screen.render();

    threads._data = { chat, threads: toArray(await Chat.threads(chat)) };
    await display();
  }
});
EE.on('chats.nextUnread', async ({ chat, thread }) => {
  if (thread) {
    threads.style.selected = {
      fg: 'black',
      bg: 'grey',
    };
    threads.style.item = {
      fg: 'grey',
    };

    if (!threads._data.chat || chat.uri !== threads._data.chat.uri) {
      threads.setItems(['Loading...']);
      threads.screen.render();

      threads._data = { chat, threads: toArray(await Chat.threads(chat)) };
    } else {
      threads._data.threads = toArray(await Chat.threads(chat));
    }

    await display(false);
    const idx = threads._data.threads.findIndex(t => t.id === thread.id);
    // we need to manually trigger `select item` as blessed doesn't think
    // anything's changed here
    if (idx === threads.selected) {
      threads.emit('select item');
    } else {
      threads.select(idx);
    }
    threads.screen.render();
  } else if (chat) {
    threads._data = {};
    threads.setItems(['Select A Room']);
    threads.screen.render();
  }
});
EE.on('input.blur', from => {
  if (from === 'threads') {
    threads.focus();
  }
});
EE.on('screen.refresh', async () => {
  if (threads._data && threads._data.chat) {
    threads._data.threads = toArray(
      await Chat.threads(threads._data.chat, true)
    );
  }
});
EE.on('messages.new', async ({ chat, thread }) => {
  if (!thread || !threads._data.chat) {
    return;
  }

  if (threads._data.chat.uri === chat.uri) {
    threads._data.threads = toArray(await Chat.threads(chat));
    const idx = threads._data.threads.findIndex(t => t.id === thread.id);
    threads.setItem(idx, await format.thread(threads._data.threads[idx]));
  }
});
EE.on('messages.sent', async () => {
  threads._data.threads[threads.selected].total++;
  threads.setItem(
    threads.selected,
    await format.thread(threads._data.threads[threads.selected])
  );
});

function toArray(ts) {
  return Object.entries(ts).map(t => t[1]);
}

module.exports = {
  threads,
};
