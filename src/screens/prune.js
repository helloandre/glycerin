const blessed = require('neo-blessed');
const Chat = require('../lib/model/chat');
const User = require('../lib/model/user');
const format = require('../lib/format');
const setRoomMembership = require('../lib/api/set-room-membership');
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
  height: '100%',
  width: '100%',
  top: 0,
  left: 0,
});
const rooms = blessed.list({
  label: 'Select Rooms To Leave. "spacebar" to select, "enter" when done.',
  top: 0,
  left: 0,
  height: '100%',
  width: '100%',
  tags: true,
  keys: true,
  border: {
    type: 'line',
  },
  style: {
    item: COLORS_ACTIVE_ITEM,
    selected: COLORS_ACTIVE_SELECTED,
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
rooms._data = {};
screen.append(prune);
screen.append(confirm);
screen.append(progress);
prune.append(rooms);

screen.on('keypress', (ch, key) => {
  switch (key.full) {
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

function bootstrap() {
  rooms.focus();
  rooms.setItems([format.placehold()]);
  screen.render();

  Chat.getGrouped().then(chats => {
    rooms._data.rooms = chats.rooms;
    display();
  });
}

function toggle() {
  rooms._data.rooms[rooms.selected].checked = !rooms._data.rooms[rooms.selected]
    .checked;
  display();
}

function display() {
  rooms.setItems(rooms._data.rooms.map(format.checkbox));
  screen.render();
}

async function leave() {
  const toLeave = rooms._data.rooms.filter(r => r.checked);
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
        await setRoomMembership(toLeave[idx], user, false);
        progress.setProgress(((idx + 1) / toLeave.length) * 100);
        screen.render();
      }
      progress.hide();

      confirm.ask(
        `Left ${toLeave.legnth} rooms. Press any key to close.`,
        () => {
          process.exit();
        }
      );
      confirm.focus();
    }
  });
  confirm.focus();
}

module.exports = {
  bootstrap,
};
