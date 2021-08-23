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
results._data = {};
input._data = {};

function selected() {
  return search._data.visible[results.selected];
}

function filterResults() {
  if (input._data.value) {
    const by = input._data.value.toLowerCase();
    search._data.visible = search._data.chats.filter(r =>
      r.normalizedName.includes(by)
    );
  } else {
    search._data.visible = search._data.chats;
  }
  display();
}

function display() {
  search._data.visible = State.chats();
  results.setItems(search._data.visible.map(format.availableRoom));
  results.select(0);
  search.screen.render();
}

function blur() {
  search._data = {};
  results._data = {};
  input._data = {};
  search.hide();
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
      return EE.emit('search.preview', selected());
    case 'enter':
      EE.emit('search.select', selected());
      return blur();
    case 'escape':
      EE.emit('search.close');
      return blur();
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

EE.on('search.activate', () => {
  input._data = { value: '' };
  input.setValue('');

  search.show();
  input.focus();
  results.setItems([format.placehold()]);
  search.screen.render();
});
EE.on('search.reactivate', () => {
  input.focus();
});
EE.on('search.update', display);

module.exports = {
  search,
};
