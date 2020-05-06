const getChats = require('../api/get-chats');
const getChatThreads = require('../api/get-chat-threads');
const getChatMessages = require('../api/get-chat-messages');
const getThreadMessages = require('../api/get-thread-messages');
const unpack = require('../api/unpack');
const User = require('./user');
const EE = require('../eventemitter');

// indexed by unpack.room.uri
const cache = {};
/**
 * Array<Object> where Object contains:
 *  - chatUri
 *  - [threadId]
 */
let unread = [];

/**
 * Give me all my chats, please
 * broken up into sections:
 *   - favorites (starred)
 *   - dms
 *   - rooms
 *   - bots
 *
 * @see unpack.chats
 */
function getAll() {
  return getChats()
    .then(unpack.chats)
    .then(async chats => {
      // eslint-disable-next-line no-unused-vars
      for (let [type, group] of Object.entries(chats)) {
        for (let chat of group) {
          cache[chat.uri] = chat;
          if (chat.isDm) {
            User.prefetch(chat.user);
          }

          // chats are ordered by unread from the endpoint
          // so we're kinda cheating here
          if (chat.isUnread) {
            if (chat.isDm) {
              markUnread(chat);
            } else {
              // this is bad. we shouldn't be blocking initial load on unread messages :(
              const ts = await threads(chat);
              Object.entries(ts)
                .filter(t => t[1].isUnread)
                .forEach(t => markUnread(t[1]));
            }
          }
        }
      }

      return chats;
    });
}

/**
 * remove this object from our unread queue, potentially out of order
 *
 * @param {unpack.chat|unpack.thread} obj
 */
function markRead(obj) {
  if ('isDm' in obj) {
    unread = unread.filter(u => u.chatUri !== obj.uri);
  } else {
    unread = unread.filter(
      u => u.chatUri !== obj.room.uri && u.threadId !== obj.id
    );
  }
}

/**
 * some assumptions here, we will never give a non-dm chat object
 *
 * @param {unpack.chat|unpack.thread} obj
 */
async function markUnread(obj) {
  if ('isDm' in obj) {
    unread.unshift({ chatUri: obj.uri, at: obj.mostRecentAt });
  } else {
    unread.unshift({
      chatUri: obj.room.uri,
      threadId: obj.id,
      at: obj.mostRecentAt,
    });
  }

  unread.sort((a, b) => (a.at > b.at ? -1 : 1));
}

async function nextUnread() {
  if (unread.length === 0) {
    return { chat: false };
  }

  const { chatUri, threadId } = unread.shift();
  const chat = cache[chatUri];

  if (threadId) {
    // we potentially haven't loaded the threads for this chat yet
    // so do so now, don't assume chat.threads exists
    await messages({ id: threadId, room: chat });

    return {
      chat,
      thread: cache[chatUri].threads[threadId],
    };
  }

  return {
    chat,
  };
}

/**
 * fetch threads from a chat, allows cache busting
 * without any paging returns the 5 most recently active threads
 * also includes the first ~10 messages of a thread. to laod more @see messages()
 *
 * @TODO support paging
 *
 * @param {unpack.chat} chat
 * @param {Boolean} ignoreCache
 *
 * @return {Boolean|unpack.thread}
 */
async function threads(chat, ignoreCache = false) {
  if (chat.isDm) {
    throw new Error(`threads called on a dm ${chat.displayName}`);
  }

  if (!cache[chat.uri].threads || ignoreCache) {
    cache[chat.uri].threads = await getChatThreads(chat).then(ts => {
      const unpacked = ts.map(unpack.thread).filter(t => !t.isMembershipUpdate);
      // we have to let the users cache know about all the users we just saw
      // so that when we go to display them we fetch all at once
      unpacked.forEach(t => t.messages.forEach(m => User.prefetch(m.user)));

      // index threads by id
      return unpacked.reduce((a, c) => {
        a[c.id] = c;
        return a;
      }, {});
    });
  }

  return cache[chat.uri].threads;
}

/**
 * fetch more messages for a thread.
 * updates cached thread
 *
 * @param {unpack.chat|unpack.thread} chat
 * @param {Boolean} force
 */
async function messages(chat, ignoreCache = false) {
  if (chat.isDm) {
    if (!cache[chat.uri].messages || ignoreCache) {
      cache[chat.uri].messages = await getChatMessages(chat).then(
        rawMessages => {
          // each "message" looks like a single-message thread
          // so... let's flatten that
          const unpacked = rawMessages.map(m => unpack.message(m[4][0]));
          unpacked.forEach(u => User.prefetch(u.user));

          return unpacked;
        }
      );
    }

    return cache[chat.uri].messages;
  }

  // this is first time we've tried to load any threads for this chat
  if (!cache[chat.room.uri].threads) {
    cache[chat.room.uri].threads = { [chat.id]: chat };
  }

  // we're dealing with a thread
  if (!cache[chat.room.uri].threads[chat.id].messages || ignoreCache) {
    // we're passed an unpack.thread
    cache[chat.room.uri].threads[chat.id].messages = await getThreadMessages(
      chat
    ).then(rawMessages => {
      const messages = rawMessages.map(unpack.message);
      messages.forEach(m => User.prefetch(m.user));

      if (messages.length === cache[chat.room.uri].threads[chat.id].total) {
        cache[chat.room.uri].threads[chat.id].unfetched = 0;
      }

      return messages;
    });
  }

  return cache[chat.room.uri].threads[chat.id].messages;
}

EE.on('messages.sent', msg => {
  if (msg.thread.id) {
    cache[msg.room.uri].threads[msg.thread.id].messages.push(msg);
    cache[msg.room.uri].threads[msg.thread.id].total++;
  } else {
    cache[msg.room.uri].messages.push(msg);
  }
});

EE.once('chats.loaded', () => {
  EE.on('events.6', evt => {
    try {
      evt.user.room = evt.room;
      User.prefetch(evt.user);
      const msg = {
        ...evt,
        isUnread: true,
      };

      if (evt.thread) {
        // we may not have loaded this chat's threads yet
        // do not do so now. we will either do so on
        // chats.select or chats.nextUnread
        const loaded =
          cache[evt.room.uri].threads &&
          cache[evt.room.uri].threads[evt.thread.id];
        if (loaded) {
          cache[evt.room.uri].threads[evt.thread.id].messages.push(msg);
          cache[evt.room.uri].isUnread = true;
          cache[evt.room.uri].threads[evt.thread.id].isUnread = true;
          cache[evt.room.uri].threads[evt.thread.id].total++;
        }
        markUnread({
          mostRecentAt: evt.mostRecentAt,
          id: evt.thread.id,
          room: evt.room,
        });
        // but we still want to tell screens/chats about it
        EE.emit('messages.new', {
          chat: evt.room,
          thread: evt.thread,
        });
      } else {
        if (cache[evt.room.uri].messages) {
          cache[evt.room.uri].messages.push(msg);
          cache[evt.room.uri].isUnread = true;
        }
        markUnread(cache[evt.room.uri]);
        EE.emit('messages.new', { chat: evt.room });
      }
    } catch (e) {
      console.log(e);
    }
  });
});

module.exports = {
  getAll,
  threads,
  messages,
  nextUnread,
  markRead,
  markUnread,
};
