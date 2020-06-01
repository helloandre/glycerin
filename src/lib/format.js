const moment = require('moment');
const User = require('./model/user');

/**
 * Display the rooms and dms the user has
 *
 * @param {unpack.chat}
 *
 * @return {String}
 */
function chat({ isUnread, displayName }) {
  const prefix = isUnread ? '*' : ' ';
  return prefix + displayName;
}

/**
 * display the:
 *  - total count of messages (bold if any unread)
 *  - time of first message
 *  - author of first message
 *  - first line of first message of the thread
 *
 * @param {unpack.thread}
 *
 * @return {String}
 */
async function thread({ isUnread, total, messages }) {
  const prefix = isUnread ? '*' : ' ';
  const affix = !isUnread && total > 99 ? '+' : ' ';
  const preview = await message(messages[0], true);
  return `{grey-fg}${prefix}${Math.min(99, total)
    .toString()
    .padStart(2, ' ')}${affix}{/grey-fg} ${preview}`;
}

/**
 * display the:
 *  - time of message
 *  - author of message
 *  - content of message (only first line if truncated)
 *
 * @param {unpack.message} msg
 * @param {Boolean} truncate
 */
async function message(msg, truncate = false) {
  const ts = moment(parseInt(msg.createdAt.substring(0, 13), 10));
  const text = textFromMsg(msg.text);
  const name = await User.name(msg.user);

  return `{grey-fg}${ts.format('YYYY-MM-DD hh:mma')}>{/grey-fg} ${name}: ${
    truncate ? msg.text.raw.split('\n').shift() : text
  }`;
}

function placehold(str = 'loading') {
  return ` {bold}{underline}... ${str} ...{/}`;
}

function availableRoom(room) {
  const count = room.memberCount
    ? ` {grey-fg}(${room.memberCount} members){/}`
    : '';
  return `${room.displayName}${count}`;
}

function checkbox(item) {
  const checked = item.checked ? `[x]` : `[ ]`;
  return `${checked} ${item.displayName}`;
}

/**
 * @TODO figure out other kinds of things. potentially use msg.parts
 *
 * @param {unpack.message} msg
 */
function textFromMsg(msg) {
  if (msg.raw.length) {
    return msg.raw;
  }

  if (msg.links) {
    switch (msg.links[0][0]) {
      case 1:
        return `<img> ${msg.links[0][6][6][2]}`;
      case 19:
        return `<history ${msg.links[0][16][0][0] === 1 ? 'on' : 'off'}>`;
      // google meet link?
      // messages that contain only a link to a google meet
      // usually from the "add video meeting" button
      case 11:
        return `<meet> ${msg.links[0][11][0][2]}`;
    }
  }

  return '<unknown msg>';
}

module.exports = {
  chat,
  thread,
  message,
  placehold,
  availableRoom,
  checkbox,
};
