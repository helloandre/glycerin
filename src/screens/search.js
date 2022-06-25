const blessed = require('neo-blessed');
const EE = require('../lib/eventemitter');
const State = require('../lib/state');
const format = require('../lib/format');
const {
  COLORS_ACTIVE_ITEM,
  COLORS_ACTIVE_SELECTED,
} = require('../../constants');

const search = blessed.box({
  height: '100%',
  width: '25%',
  top: 0,
  left: 0,
  hidden: true,
  style: {
    fg: 'white',
  },
});
const input = blessed.textbox({
  label: 'Search',
  border: {
    type: 'line',
  },
  width: '100%',
  height: '10%+1',
  style: {
    fg: 'white',
  },
  cursor: {
    artificial: true,
    shape: 'underline',
    blink: true,
  },
});
const results = blessed.list({
  top: '10%',
  height: '90%',
  width: '100%',
  tags: true,
  border: {
    type: 'line',
  },
  style: {
    item: COLORS_ACTIVE_ITEM,
    selected: COLORS_ACTIVE_SELECTED,
  },
});
search.append(input);
search.append(results);
search._data = {};
input._data = {};

function selected() {
  return search._data.visible[results.selected];
}

function filterResults() {
  if (!search._data.available) {
    return;
  }

  if (input._data.value) {
    const by = input._data.value.toLowerCase();
    search._data.visible = search._data.available.filter(r =>
      r.normalizedName.includes(by)
    );
  } else {
    search._data.visible = search._data.available;
  }
  display();
}

function display() {
  const s = State.search();
  if (s.loading) {
    results.setItems([format.placehold()]);
  } else {
    results.setItems(search._data.visible.map(format.availableRoom));
  }
  results.select(0);
  search.screen.render();
}

input.on('keypress', async (ch, key) => {
  switch (key.full) {
    case 'return':
      return; // :(  ... there's a lot of pain here.
    case 'down':
    case 'linefeed':
      results.down();
      results.screen.render();
      return;
    case 'up':
    case 'C-k':
      results.up();
      results.screen.render();
      return;
    case 'right':
    case 'C-p':
      if (State.search().mode === 'local') {
        EE.emit('search.select', selected());
      } else {
        EE.emit('search.preview', selected());
      }
      return;
    case 'enter':
      EE.emit('search.select', selected());
      return;
    case 'escape':
      EE.emit('search.close');
      return;
    // these listeners need to be duplicated from screen
    // as input captures keys and doesn't bubble them
    case 'C-d':
      process.exit(0);
  }

  if (key.name === 'backspace') {
    if (input._data.value.length) {
      input._data.value = input._data.value.slice(0, -1);
    }
    // eslint-disable-next-line no-control-regex
  } else if (ch && !/^[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]$/.test(ch)) {
    input._data.value += ch;
  }

  input.setValue(input._data.value);
  filterResults();
});

EE.on('threads.blur', () => {
  if (State.search()) {
    input.focus();
  }
});

EE.on('state.search.updated', () => {
  const s = State.search();
  if (s) {
    // we're bootstrapping (i.e. not regaining focus from a preview)
    if (!s.loading) {
      input._data = { value: '' };
      search._data.available = s.available;
      search._data.visible = s.available;
      input.setValue('');
    }

    if (!search.visible) {
      search.show();
      input.focus();
    }

    display();
  } else if (search._data.available) {
    search._data = {};
    input._data = {};
    search.hide();
    search.screen.render();
  }
});

module.exports = {
  search,
};
