const blessed = require('neo-blessed');
const State = require('../lib/state');
const format = require('../lib/format');
const Chat = require('../lib/model/chat');
const EE = require('../lib/eventemitter');
const {
  COLORS_ACTIVE_ITEM,
  COLORS_ACTIVE_SELECTED,
  COLORS_INACTIVE_ITEM,
  COLORS_INACTIVE_SELECTED,
} = require('../../constants');

const DEFAULT_CONTENT = ' Select A Room';

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
  content: DEFAULT_CONTENT,
  // mouse: true,
  // keys: true,
  // vi: true,
});
threads._data = {
  chat: false,
  visible: [],
};
threads.thread = function () {
  return threads._data.visible[threads.selected];
};
threads.loading = function () {
  threads.setContent(format.placehold());
};
threads.wipe = function () {
  threads.setContent(DEFAULT_CONTENT);
};

async function display() {
  const displayable = State.threads();
  if (!displayable) {
    threads.wipe();
    threads.screen.render();
    return;
  }

  threads._data.visible = displayable;

  if (!displayable.length) {
    threads.setContent(format.placehold('no threads, yet'));
  } else {
    const formatted = [];
    // eslint-disable-next-line no-unused-vars
    for (let thread of displayable) {
      formatted.push(await format.thread(thread));
    }
    threads.setItems(formatted);
    threads.select(formatted.length - 1);
  }
  threads.screen.render();
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

/**
 * Keybindings
 */

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
  EE.emit('threads.blur');
});

/**
 * Send events to messages
 */
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
  if (threads._data.visible.length) {
    EE.emit('threads.preview', threads.thread());
  }
});

/**
 * External Events
 */
EE.on('threads.activate', function () {
  threads.focus();
  threads.loading();
  threads.screen.render();
});
EE.on('threads.update', display);

module.exports = {
  threads,
};
