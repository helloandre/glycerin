const blessed = require('neo-blessed');
const Chat = require('../lib/model/chat');
const EE = require('../lib/eventemitter');
const format = require('../lib/format');
const {
  COLORS_ACTIVE_ITEM,
  COLORS_ACTIVE_SELECTED,
  COLORS_INACTIVE_ITEM,
  COLORS_INACTIVE_SELECTED,
} = require('../../constants');

const DEFAULT_DISPLAY_LIMIT = 5;

const chats = blessed.list({
  label: 'Rooms',
  width: '25%',
  height: '100%',
  tags: true,
  border: {
    type: 'line',
  },
  style: {
    item: COLORS_ACTIVE_ITEM,
    selected: COLORS_ACTIVE_SELECTED,
  },
});
chats._data = { chats: {}, expanded: [] };

chats.on('keypress', (ch, key) => {
  const selected = chats._data.visible[chats.selected];

  switch (key.full) {
    case 'C-l':
      EE.emit('chats.leave', selected);
      // TODO remove from list
      return;
    case 'j':
    case 'down':
      chats.down();
      chats.screen.render();
      return;
    case 'k':
    case 'up':
      chats.up();
      chats.screen.render();
      return;
    case 'e':
      expand();
      return;
    case 'c':
      collapse();
      return;
    case 'enter':
    case 'right':
    case 'v':
      if (selected.expand) {
        expand();
      } else if (selected.collapse) {
        collapse();
      } else {
        EE.emit('chats.select', selected);
      }
      chats.screen.render();
      return;
  }
});

chats.on('focus', () => {
  chats.style.item = COLORS_ACTIVE_ITEM;
  chats.style.selected = COLORS_ACTIVE_SELECTED;
  chats.screen.render();
});
chats.on('blur', () => {
  chats.style.item = COLORS_INACTIVE_ITEM;
  chats.style.selected = COLORS_INACTIVE_SELECTED;
  chats.screen.render();
});
EE.on('screen.ready', loadAll);
EE.on('screen.refresh', loadAll);
EE.on('search.blur', () => {
  chats.focus();
  chats.screen.render();
});
EE.on('chats.nextUnread', chat => {
  select(chat.room || chat);
});
EE.on('messages.new', ({ chat }) => {
  const { typeIndex, type, visibleIndex } = indexes(chat);
  if (visibleIndex !== chats.selected) {
    chats._data.chats[type][typeIndex].isUnread = true;
    display();
  } else {
    Chat.markRead(chat);
  }
});
EE.on('input.blur', from => {
  if (from === 'chats') {
    chats.focus();
  }
});
EE.on('threads.blur', fromPreview => {
  if (!fromPreview) {
    chats.focus();
  }
});
// need to wait until after chat is joined otherwise
// we break assumptions about it's availability in cache
EE.on('chats.joined', chat => {
  chats.focus();

  if (chat.isDm) {
    chats._data.chats.dms.unshift(chat);
  } else {
    chats._data.chats.rooms.unshift(chat);
  }

  display();
  select(chat);
  EE.emit('chats.select', chat);
});

function expand(t) {
  const type = t || selectedType();
  if (!expanded(type)) {
    chats._data.expanded.push(type);
    display();
    chats.screen.render();
  }
}
function collapse() {
  const type = selectedType();
  if (expanded(type)) {
    chats._data.expanded = chats._data.expanded.filter(t => t !== type);
    display();
    chats.screen.render();
  }
}
function selectedType() {
  const idx = chats.selected;
  let currentLen = 0;
  for (let type of Object.keys(chats._data.chats)) {
    const limit = displayLimit(type);
    const expando = expanded(type) || shouldDisplayExpando(type) ? 1 : 0;
    const nextLen = currentLen + limit + expando;
    if (idx >= currentLen && idx < nextLen) {
      return type;
    }
    currentLen = nextLen;
  }
}
function displayLimit(type) {
  return !expanded(type) &&
    chats._data.chats[type].length > DEFAULT_DISPLAY_LIMIT
    ? DEFAULT_DISPLAY_LIMIT
    : chats._data.chats[type].length;
}
function shouldDisplayExpando(type) {
  return (
    chats._data.chats[type].length > DEFAULT_DISPLAY_LIMIT &&
    displayLimit(type) === DEFAULT_DISPLAY_LIMIT
  );
}
function expanded(type) {
  return chats._data.expanded.indexOf(type) !== -1;
}
function select(chat) {
  const { visibleIndex, needsExpanding, type } = indexes(chat);
  if (needsExpanding) {
    expand(type);
  }

  chats.select(visibleIndex);
  chats.screen.render();
}
function indexes(chat) {
  let numAbove = 0;
  for (let type of Object.keys(chats._data.chats)) {
    const typeIndex = chats._data.chats[type].findIndex(
      c => c.uri === chat.uri
    );
    const limit = displayLimit(type);
    if (typeIndex !== -1) {
      return {
        type,
        typeIndex,
        needsExpanding: typeIndex > limit,
        visibleIndex: typeIndex + numAbove,
      };
    }

    const expando = expanded(type) || shouldDisplayExpando(type) ? 1 : 0;
    numAbove += limit + expando;
  }

  return { index: -1 };
}

function display() {
  let content = [];
  let visible = [];

  for (let [type, data] of Object.entries(chats._data.chats)) {
    const items = data.slice(0, displayLimit(type));
    content = content.concat(items.map(format.chat));
    visible = visible.concat(items);

    if (expanded(type)) {
      content.push('{underline}▲ Collapse{/}');
      visible.push({ collapse: true });
    } else if (shouldDisplayExpando(type)) {
      content.push('{underline}▼ Expand{/}');
      visible.push({ expand: true });
    }
  }

  chats.setItems(content);
  chats._data.visible = visible;
  chats.screen.render();
}

async function loadAll() {
  chats.setItems([format.placehold()]);
  chats.screen.render();

  chats._data.chats = await Chat.getGrouped();
  display();
  EE.emit('chats.loaded');
}

module.exports = {
  chats,
};
