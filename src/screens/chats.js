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
chats.chat = function () {
  return chats._data.visible[chats.selected];
};

chats.key('C-r l', () => leave(chats.chat()));
chats.key('e', toggleExpand);
chats.key(['j', 'down'], () => {
  chats.down();
  chats.screen.render();
});
chats.key(['k', 'up'], () => {
  chats.up();
  chats.screen.render();
});
chats.key(['g'], () => {
  chats.select(0);
  chats.screen.render();
});
chats.key(['S-g'], () => {
  chats.select(chats._data.visible.length - 1);
  chats.screen.render();
});
chats.key('enter', () => {
  const selected = chats.chat();
  if (selected.title) {
    if (selected.expand) {
      expand();
    } else if (selected.collapse) {
      collapse();
    }

    chats.screen.render();
  } else {
    EE.emit('chats.select', selected);
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
EE.on('search.blur', found => {
  if (!found) {
    chats.focus();
    chats.screen.render();
  }
});
EE.on('chats.nextUnread', chat => {
  if (chat) {
    select(chat.room || chat);
  }
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
EE.on('search.select', chat => {
  const { index } = indexes(chat);
  if (index === -1) {
    if (chat.isDm) {
      chats._data.chats.dms.unshift(chat);
    } else {
      chats._data.chats.rooms.unshift(chat);
    }
  }

  display();
  select(chat);
  EE.emit('chats.select', chat);
});

function toggleExpand() {
  const type = selectedType();
  const prevSelected = chats.selected;
  if (expanded(type)) {
    collapse(type);
  } else {
    expand(type);
  }

  chats.select(prevSelected);
  chats.screen.render();
}
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
    const nextLen = currentLen + limit + 1;
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
        visibleIndex: typeIndex + numAbove + 1,
      };
    }

    numAbove += limit + 1;
  }

  return { index: -1 };
}

function display() {
  let content = [];
  let visible = [];

  for (let [type, data] of Object.entries(chats._data.chats)) {
    if (expanded(type)) {
      content.push(`{underline}▲ Collapse ${type}{/}`);
      visible.push({ collapse: true, title: true });
    } else if (shouldDisplayExpando(type)) {
      content.push(`{underline}▼ Expand ${type}{/}`);
      visible.push({ expand: true, title: true });
    } else {
      content.push(`{underline}${type}{/}`);
      visible.push({ title: true });
    }

    const items = data.slice(0, displayLimit(type));
    content = content.concat(items.map(format.chat));
    visible = visible.concat(items);
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
