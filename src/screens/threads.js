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
  content: DEFAULT_CONTENT,
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
  visible: [],
};
threads.thread = function () {
  return threads._data.visible[threads.selected];
};

async function display() {
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
    threads._data.visible = displayable.threads;
    const formatted = [];
    for (let thread of displayable.threads) {
      formatted.push(await format.thread(thread));
    }
    threads.setItems(formatted);

    const t = State.thread();
    if (t) {
      threads.select(threads._data.visible.findIndex(v => v.id === t.id));
    } else if (threads._data.lastIdBeforeFetching) {
      const idx = threads._data.visible.findIndex(
        t => t.id === threads._data.lastIdBeforeFetching
      );
      threads._data.lastIdBeforeFetching = false;
      // select the oldest unseen thread
      threads.select(idx - 1);
    } else if (!threads._data.fetchingMore) {
      threads.select(formatted.length - 1);
    }
  }
  threads._data.fetchingMore = false;
  threads.screen.render();
}

/**
 * Keybindings
 */

function _up() {
  if (threads._data.fetchingMore) {
    return;
  }

  if (threads.selected === 0) {
    if (!State.chat().hasMoreThreads) {
      return;
    }

    threads._data.fetchingMore = true;
    threads._data.lastIdBeforeFetching = threads.thread().id;
    threads.unshiftItem(format.placehold('loading more'));
    threads.select(0);
    threads.screen.render();

    EE.emit('threads.fetchMore');
  } else {
    threads.up();
    threads.screen.render();
  }
}

function _down() {
  if (threads._data.fetchingMore) {
    return;
  }
  threads.down();
  threads.screen.render();
}

threads.key('n', () => {
  if (!State.search()) {
    EE.emit('threads.new', threads._data.chat);
  }
});
threads.key(['k', 'up'], _up);
EE.on('input.threads.up', () => {
  _up();
  EE.emit('threads.select', threads.thread());
});
threads.key(['j', 'down'], _down);
EE.on('input.threads.down', () => {
  _down();
  EE.emit('threads.select', threads.thread());
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
  EE.emit('threads.select', threads.thread());
});
threads.key(['escape', 'q'], () => {
  EE.emit('threads.blur');
});
threads.key('C-t l', () => EE.emit('state.pop'));

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
