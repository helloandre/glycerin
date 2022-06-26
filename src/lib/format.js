const moment = require('moment');
const chalk = require('chalk');
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
  return (
    chalk.grey(
      `${prefix}${Math.min(99, total).toString().padStart(2)}${affix}`
    ) + preview
  );
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
  const stamp = ts.format('YYYY-MM-DD hh:mma');
  const name = await User.name(msg.user);
  const me = await User.whoami();

  return `${chalk.grey(stamp + '>')} ${chalk.underline(name)}: ${
    truncate ? msg.text.raw.split('\n').shift() : textFromMsg(msg.text, me)
  }`;
}

function placehold(str = 'loading') {
  return ` {bold}{underline}... ${str} ...{/}`;
}

function availableRoom(room) {
  const count = room.memberCount
    ? chalk.grey(` (${room.memberCount} members)`)
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
 * @param {User} me
 */
function textFromMsg(msg, me) {
  const orig = msg.raw.length ? msg.raw : '';
  let text = orig + '';
  // if we insert text that is a different length than part
  let offset = 0;

  if (msg.formatting) {
    for (const f of msg.formatting) {
      let part = orig.substring(f.indexStart, f.indexEnd);
      let insert = part;
      // 1 === link
      // 6 === mention
      // 8 === inlineblock text (see textType)
      // 11 === google meet link
      // 13 === image
      switch (f.type) {
        case 1:
          if (part !== f.link.raw) {
            insert = `(${part})[${chalk.cyan(f.link.raw)}]`;
          } else {
            insert = chalk.cyan(part);
          }
          break;
        case 6:
          insert =
            me.id === f.mention.id
              ? chalk.red(part)
              : chalk.red('@') + part.substring(1);
          break;
        case 8:
          // 5 == monospace text (inside `)
          // 6 == `
          // 7 == block text (inside ```)
          switch (f.textType) {
            case 5:
              insert = chalk.bgGrey(part);
              break;
            case 6:
              insert = '';
              break;
            case 7:
              const parts = part.split('\n');
              const longestLine = parts.reduce(
                (max, line) => (line.length > max ? line.length : max),
                0
              );
              insert = `\n${chalk.bgGrey(
                parts.map(line => line.padEnd(longestLine)).join('\n')
              )}\n`;
              break;
          }
          break;
        case 11:
          insert = `${chalk.grey('<meet>:')} ${chalk.cyan(f.meet.link)}`;
          break;
        case 13:
          insert = `${chalk.grey('<img>:')} ${f.image.title}`;
          break;
      }

      text = _ins(text, f.indexStart + offset, f.indexEnd + offset, insert);
      offset += insert.length - part.length;
    }
  }

  return text.length ? text : '<unknown msg>';
}

function _ins(text, start, end, content) {
  return text.substring(0, start) + content + text.substring(end);
}

module.exports = {
  chat,
  thread,
  message,
  placehold,
  availableRoom,
  checkbox,
};
