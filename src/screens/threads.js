const blessed = require('neo-blessed');
const format = require('../lib/format');
const Chat = require('../lib/model/chat');
const EE = require('../lib/eventemitter');
const {
  COLORS_ACTIVE_ITEM,
  COLORS_ACTIVE_SELECTED,
  COLORS_INACTIVE_ITEM,
  COLORS_INACTIVE_SELECTED,
} = require('../../constants');

const threads = blessed.list({
  label: 'Threads',
  left: '25%',
  height: '25%',
  width: '75%',
  tags: true,
  border: {
    type: 'line',
  },
  // do not set a default style
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
  if (!threads._data.threads.length) {
    threads.setItems([format.placehold('no threads, yet')]);
    threads.screen.render();
    return;
  }

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
  if (threads.selected === 0 && !threads._data.searchPreview) {
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

threads.key('C-t n', () => {
  if (!threads._data.searchPreview) {
    EE.emit('threads.new', threads._data.chat);
  }
});
threads.key(['k', 'up'], up);
threads.key(['j', 'down'], () => {
  threads.down();
  threads.screen.render();
});
threads.key(['g'], () => {
  threads.select(0);
  threads.screen.render();
});
threads.key(['S-g'], () => {
  threads.select(threads.items.length - 1);
  threads.screen.render();
});
threads.key('enter', () => {
  // if we're previewing, we cannot "select" a thread
  // but we can still nagivate messages
  if (!threads._data.searchPreview) {
    threads.style.item = COLORS_INACTIVE_ITEM;
    threads.style.selected = COLORS_INACTIVE_SELECTED;
    EE.emit('threads.select', threads.thread());
  } else {
    EE.emit('search.select', threads._data.chat);
  }
});
threads.key(['escape', 'q'], () => {
  threads.style.item = COLORS_INACTIVE_ITEM;
  threads.style.selected = COLORS_INACTIVE_SELECTED;
  EE.emit('threads.blur', threads._data.searchPreview);

  // needs to be done before setItems() otherwise we attempt
  // to threads.preview as a "set item" even gets triggered
  threads._data = {};
  threads.setItems(['Select A Room']);
  threads.screen.render();
});

// messages
threads.key('C-k', () => EE.emit('messages.scroll.up'));
threads.key('linefeed', () => EE.emit('messages.scroll.down'));
threads.key('C-g', () => EE.emit('messages.scroll.top'));
threads.key('C-l', () => EE.emit('messages.scroll.bottom'));
threads.key('C-e', () => EE.emit('messages.expand'));

threads.on('focus', () => {
  threads.style.item = COLORS_ACTIVE_ITEM;
  threads.style.selected = COLORS_ACTIVE_SELECTED;
  threads.screen.render();
});
threads.on('blur', () => {
  if (threads._data.chat) {
    threads.style.item = COLORS_INACTIVE_ITEM;
    threads.style.selected = COLORS_INACTIVE_SELECTED;
    threads.screen.render();
  }
});
threads.on('select item', () => {
  if (threads._data.chat) {
    EE.emit('threads.preview', threads.thread());
  }
});
EE.on('chats.select', async chat => {
  if (!chat.isDm) {
    threads.focus();
    threads.setItems([format.placehold()]);
    threads.screen.render();

    threads._data = { chat, threads: await Chat.threads(chat) };
    await display();
  }
});
EE.on('chats.nextUnread', async chat => {
  if (!chat) {
    return;
  }

  if (chat.room) {
    if (!threads._data.chat || chat.room.uri !== threads._data.chat.uri) {
      threads.setItems([format.placehold()]);
      threads.screen.render();
    }

    threads.style.item = COLORS_INACTIVE_ITEM;
    threads.style.selected = COLORS_INACTIVE_SELECTED;

    threads._data = {
      chat: chat.room,
      threads: await Chat.threads(chat.room),
    };

    await display(false);
    const idx = threads._data.threads.findIndex(t => t.id === chat.id);
    // we need to manually trigger `select item` as blessed doesn't think
    // anything's changed here
    if (idx === threads.selected) {
      threads.emit('select item');
    } else {
      threads.select(idx);
    }
    threads.screen.render();
  } else {
    // we have an unread, but it's a DM
    threads._data = {};
    threads.setItems(['Select A Room']);
    threads.screen.render();
  }
});
EE.on('search.preview', async chat => {
  threads.focus();
  threads.setItems([format.placehold()]);
  threads.screen.render();

  threads._data = {
    chat,
    searchPreview: true,
    threads: await Chat.preview(chat),
  };
  display();
});

EE.on('input.blur', from => {
  if (from === 'threads') {
    threads.focus();
    EE.emit('threads.preview', threads.thread());
  }
});
EE.on('screen.refresh', async () => {
  if (threads._data && threads._data.chat) {
    threads._data.threads = await Chat.threads(threads._data.chat, true);
  }
});
EE.on('messages.new', async ({ chat, thread }) => {
  if (!thread || !threads._data.chat) {
    return;
  }

  if (threads._data.chat.uri === chat.uri) {
    threads._data.threads = await Chat.threads(chat);
    const idx = threads._data.threads.findIndex(t => t.id === thread.id);
    if (idx >= threads.items.length) {
      threads.appendItem(await format.thread(threads._data.threads[idx]));
      threads.select(idx);
    } else {
      threads.setItem(idx, await format.thread(threads._data.threads[idx]));
    }
    Chat.markRead(thread);
  }
});

module.exports = {
  threads,
};
