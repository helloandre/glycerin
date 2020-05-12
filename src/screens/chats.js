const blessed = require('neo-blessed');
const Chat = require('../lib/model/chat');
const EE = require('../lib/eventemitter');
const format = require('../lib/format');
const working = require('./working');
const confirm = require('./confirm');
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

chats.on('keypress', async (ch, key) => {
  const selected = chats._data.visible[chats.selected];

  switch (key.full) {
    case 'C-l':
      await leave(selected);
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
EE.on('chats.join', chat => {
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
// this assumes a chat can only be in one type, but ¯\_(ツ)_/¯
function typeOf(chat) {
  for (let type of Object.keys(chats._data.chats)) {
    if (chats._data.chats[type].findIndex(c => c.uri === chat.uri) !== -1) {
      return type;
    }
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

function leave(chat) {
  return confirm.ask(`Leave ${chat.displayName}?`).then(async ans => {
    if (ans) {
      working.show();
      const sel = chats.selected;
      await Chat.leave(chat);
      const type = typeOf(chat);
      chats._data.chats[type] = chats._data.chats[type].filter(
        c => c.uri !== chat.uri
      );

      display();
      chats.select(sel);
      working.hide();
    }
  });
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
