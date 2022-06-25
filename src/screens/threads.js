const blessed = require('neo-blessed');
const State = require('../lib/state');
const format = require('../lib/format');
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
  items: [DEFAULT_CONTENT],
  scrollable: true,
  scrollbar: {
    style: {
      fg: 'black',
      bg: 'white',
    },
  },
  alwaysScroll: true,
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

async function display() {
  threads._data.fetchingMore = false;
  const displayable = State.threads();
  if (!displayable) {
    threads.setItems([DEFAULT_CONTENT]);
    threads.selected = undefined;
    threads.screen.render();
    return;
  }

  if (!displayable.threads.length) {
    threads.setContent(
      format.placehold(displayable.loading ? 'loading' : 'no threads, yet')
    );
  } else {
    const previouslySelected = threads.selected;
    threads._data.visible = displayable.threads;
    const formatted = [];
    for (let thread of displayable.threads) {
      formatted.push(await format.thread(thread));
    }
    threads.setItems(formatted);
    if (!previouslySelected) {
      threads.select(formatted.length - 1);
    }
  }
  threads.screen.render();
}

async function up() {
  if (threads._data.fetchingMore && threads.selected === 1) {
    return;
  }

  if (threads.selected === 0 && !threads._data.searchPreview) {
    if (!State.chat().haMoreThreads) {
      return;
    }

    threads._data.fetchingMore = true;
    threads.unshiftItem(format.placehold('loading more'));
    threads.select(1);
    threads.screen.render();

    EE.emit('threads.fetchMore');
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
    EE.emit('threads.select', threads.thread());
  } else {
    EE.emit('search.select', threads._data.chat);
  }
});
threads.key(['escape', 'q'], () => {
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
  threads.style.item = COLORS_INACTIVE_ITEM;
  threads.style.selected = COLORS_INACTIVE_SELECTED;
  threads.screen.render();
});
/**
 * External Events
 */
EE.on('state.chats.loading', display);
EE.on('state.threads.updated', () => {
  const c = State.chat();
  if (c && c.isThreaded && !State.thread()) {
    threads.focus();
  }
  display();
});

module.exports = {
  threads,
};
