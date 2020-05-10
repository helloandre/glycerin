const moment = require('moment');
const User = require('./model/user');

/**
 * Display the rooms and dms the user has
 *
 * @param {unpack.chat} c
 *
 * @return {String}
 */
function chat(c) {
  if (c.isUnread) {
    return `{bold}${c.displayName}{/bold}`;
  }
  return c.displayName;
}

/**
 * display the:
 *  - total count of messages (bold if any unread)
 *  - time of first message
 *  - author of first message
 *  - first line of first message of the thread
 *
 * @param {unpack.thread} t
 *
 * @return {String}
 */
async function thread(t) {
  const countStr = t.total
    ? t.total > 99
      ? '99+'
      : `${t.total.toString().padEnd(3, ' ')}`
    : '+  ';
  const prefixStr = t.isUnread
    ? `{bold}${countStr}{/bold}`
    : `{grey-fg}${countStr}{/grey-fg}`;
  const preview = await message(t.messages[0], true);
  return `${prefixStr} ${preview}`;
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
    const name =
      msg.links[0][0] == 1 ? msg.links[0][6][6][2] : msg.links[0][9][2];
    return `<img> ${name}`;
  }

  return '<_unknown_>';
}

module.exports = {
  chat,
  thread,
  message,
  placehold,
  availableRoom,
};
