const blessed = require('neo-blessed');
const EE = require('../lib/eventemitter');
const State = require('../lib/state');
const User = require('../lib/model/user');
const format = require('../lib/format');
const setRoomMembership = require('../lib/api/set-room-membership');
const hideChat = require('../lib/api/hide-chat');

const {
  COLORS_ACTIVE_ITEM,
  COLORS_ACTIVE_SELECTED,
  COLORS_INACTIVE_ITEM,
  COLORS_INACTIVE_SELECTED,
} = require('../../constants');

const screen = blessed.screen({
  smartCSR: true,
  fullUnicode: true,
  cursor: {
    shape: 'line',
    blink: true,
  },
});
const prune = blessed.box({
  label:
    '"spacebar" to select, "enter" when done. "h/l" or "left/right arrow" to select dms or rooms.',
  height: '100%',
  width: '100%',
  top: 0,
  left: 0,
  border: {
    type: 'bg',
  },
});
const rooms = blessed.list({
  top: 0,
  left: 0,
  height: '100%',
  width: '50%',
  tags: true,
  keys: true,
  vi: true,
  border: {
    type: 'line',
  },
  style: {
    item: COLORS_ACTIVE_ITEM,
    selected: COLORS_ACTIVE_SELECTED,
  },
});
const dms = blessed.list({
  top: 0,
  left: '50%',
  height: '100%',
  width: '50%',
  tags: true,
  keys: true,
  vi: true,
  border: {
    type: 'line',
  },
  style: {
    item: COLORS_INACTIVE_ITEM,
    selected: COLORS_INACTIVE_SELECTED,
  },
});
const confirm = blessed.question({
  top: 'center',
  left: 'center',
  border: {
    type: 'line',
  },
  height: '25%',
  width: '25%',
  shadow: true,
  align: 'center',
  valign: 'center',
});
const progress = blessed.progressbar({
  orientation: 'horizontal',
  hidden: true,
  top: 'center',
  left: 'center',
  width: '50%',
  height: '20%',
  style: {
    bar: {
      bg: 'white',
    },
  },
  border: {
    type: 'line',
  },
  filled: 0,
});
rooms._data = { rooms: [] };
dms._data = { dms: [] };
screen.append(prune);
screen.append(confirm);
screen.append(progress);
prune.append(rooms);
prune.append(dms);

screen.on('keypress', (ch, key) => {
  switch (key.full) {
    case 'left':
      return rooms.focus();
    case 'right':
      return dms.focus();
    case 'enter':
      return leave();
    case 'space':
      return toggle();
    case 'q':
    case 'C-d':
      process.exit(0);
  }
});

rooms.on('blur', () => {
  rooms.style.item = COLORS_INACTIVE_ITEM;
  rooms.style.selected = COLORS_INACTIVE_SELECTED;
  screen.render();
});
rooms.on('focus', () => {
  rooms.style.item = COLORS_ACTIVE_ITEM;
  rooms.style.selected = COLORS_ACTIVE_SELECTED;
  screen.render();
});
dms.on('blur', () => {
  dms.style.item = COLORS_INACTIVE_ITEM;
  dms.style.selected = COLORS_INACTIVE_SELECTED;
  screen.render();
});
dms.on('focus', () => {
  dms.style.item = COLORS_ACTIVE_ITEM;
  dms.style.selected = COLORS_ACTIVE_SELECTED;
  screen.render();
});
EE.on('state.chats.updated', () => {
  State.chats().forEach(c => {
    if (c.isDm) {
      dms._data.dms.push(c);
    } else {
      rooms._data.rooms.push(c);
    }
  });
  display();
});

function bootstrap() {
  rooms.focus();
  rooms.setItems([format.placehold()]);
  screen.render();

  EE.emit('screen.ready');
}

function toggle() {
  if (screen.focused === rooms) {
    rooms._data.rooms[rooms.selected].checked = !rooms._data.rooms[
      rooms.selected
    ].checked;
  } else {
    dms._data.dms[dms.selected].checked = !dms._data.dms[dms.selected].checked;
  }
  display();
}

function display() {
  rooms.setItems(rooms._data.rooms.map(format.checkbox));
  dms.setItems(dms._data.dms.map(format.checkbox));
  screen.render();
}

async function leave() {
  const toLeave = rooms._data.rooms
    .filter(r => r.checked)
    .concat(dms._data.dms.filter(d => d.checked));
  if (!toLeave.length || screen.focused === confirm) {
    return;
  }

  confirm.ask(`Leave ${toLeave.length} rooms? [Yn]`, async (err, ans) => {
    confirm.hide();
    screen.render();

    if (ans) {
      progress.show();
      screen.render();

      const user = await User.whoami();
      for (let idx in toLeave) {
        if (toLeave[idx].isDm) {
          await hideChat(toLeave[idx]);
        } else {
          await setRoomMembership(toLeave[idx], user, false);
        }
        progress.setProgress(((idx + 1) / toLeave.length) * 100);
        screen.render();
      }
      progress.hide();

      confirm.ask(`Left ${toLeave.length} rooms. Press any key to close.`, () =>
        process.exit(0)
      );
      confirm.focus();
    }
  });
  confirm.focus();
}

module.exports = {
  bootstrap,
};
