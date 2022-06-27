const blessed = require('neo-blessed');
const State = require('../lib/state');
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
  items: [format.placehold()],
});
chats._data = {
  visible: [],
};
chats.chat = function () {
  return chats._data.visible[chats.selected];
};

/**
 * Keybindings
 */
chats.key('/', () => EE.emit('search.local'));
chats.key('f', () => EE.emit('search.remote'));
chats.key('C-r l', () => leave(chats.chat()));
// chats.key('e', toggleExpand);
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
  EE.emit('chats.select', chats.chat());
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

/**
 * External events
 */
EE.on('state.chats.updated', () => {
  const c = State.chat();
  if (!c) {
    chats.focus();
  }
  display();
});
EE.on('input.chats.up', () => {
  chats.up();
  EE.emit('chats.select', chats.chat());
});
EE.on('input.chats.down', () => {
  chats.down();
  EE.emit('chats.select', chats.chat());
});

function display() {
  // Object.keys(chats._data.config).forEach(type => {
  //   // ugh
  //   const displayable = allChats.filter(chat => chatType(chat) === type);

  //   if (chats._data.config[type].expanded) {
  //     content.push(`{underline}▲ Collapse ${type}{/}`);
  //     visible.push({ collapse: true, title: true });
  //   } else {
  //     if (displayable.length > chats._data.config[type].collapsedMax) {
  //       content.push(`{underline}▼ Expand ${type}{/}`);
  //       visible.push({ expand: true, title: true });
  //     } else {
  //       content.push(`{underline}${type}{/}`);
  //       visible.push({ title: true });
  //     }
  //   }

  //   const toDisplay = displayable.slice(
  //     0,
  //     chats._data.config[type].collapsedMax
  //   );
  //   content = content.concat(toDisplay.map(format.chat));
  //   visible = visible.concat(toDisplay);
  // });

  chats._data.visible = State.chats();
  chats.setItems(chats._data.visible.map(format.chat));

  const c = State.chat();
  if (c) {
    const idx = chats._data.visible.findIndex(v => v.uri === c.uri);
    chats.select(idx);
  }
  chats.screen.render();
}

function leave(chat) {
  return confirm.ask(`Leave ${chat.displayName}?`).then(async ans => {
    if (ans) {
      EE.emit('chats.leave', chats.chat());
    }
  });
}

module.exports = {
  chats,
};
