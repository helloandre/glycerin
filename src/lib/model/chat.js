const timestamp = require('../timestamp');
const getChats = require('../api/get-chats');
const getChatThreads = require('../api/get-chat-threads');
const getChatMessages = require('../api/get-chat-messages');
const getThreadMessages = require('../api/get-thread-messages');
const setRoomMembership = require('../api/set-room-membership');
const markReadAPI = require('../api/mark-read');
const unpack = require('../api/unpack');
const User = require('./user');
const EE = require('../eventemitter');

// indexed by unpack.room.uri
const cache = {};
/**
 * Array<Object> where Object contains:
 *  - at @see timestamp.now()
 *  - id
 *  - uri - only on chats
 *  - room - only on threads
 */
let unread = [];

// how many chat's we'll auto-fetch data for
// after that you're on your own because we want fast boot times
const MAX_UNREAD = 5;

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
function getGrouped() {
  return getChats()
    .then(unpack.chats)
    .then(async chats => {
      let unreadCount = 0;

      // eslint-disable-next-line no-unused-vars
      for (let [type, group] of Object.entries(chats)) {
        for (let chat of group) {
          cache[chat.uri] = chat;
          chat.users.forEach(User.prefetch);

          // chats are ordered by unread from the endpoint
          // so we're kinda cheating here
          if (chat.isUnread) {
            if (chat.isDm) {
              // we get dms for free
              markUnread(chat);
            } else if (unreadCount < MAX_UNREAD) {
              // this is unfortunate. we're blocking initial load on unread messages :(
              (await threads(chat)).filter(t => t.isUnread).forEach(markUnread);
            }
            unreadCount++;
          }
        }
      }

      return chats;
    });
}

/**
 * this assumes getGrouped has been called
 *
 * @return {Array<unpack.chat>}
 */
function getAll() {
  return Object.entries(cache).map(c => c[1]);
}

/**
 * remove this object from our unread queue, potentially out of order
 * and tell the server that it's been read
 *
 * @param {unpack.chat|unpack.thread} obj
 */
function markRead(obj) {
  const before = unread.length;
  unread = unread.filter(u => u.id !== obj.id || u.uri !== obj.uri);
  if (before !== unread.length) {
    // fire and forget
    markReadAPI(obj);

    const c = _chat(obj.room ? obj.room : obj);
    if (c) {
      c.isUnread = false;

      if (c.threads) {
        c.threads.forEach(t => (t.isUnread = false));
      }
      EE.emit('chats.read', c);
    }
  }
}

/**
 * some assumptions here:
 *
 * @param {unpack.chat|unpack.thread} obj
 */
async function markUnread(obj) {
  // put this object at the front of unread
  unread = [
    {
      id: obj.id,
      uri: obj.uri,
      room: obj.room,
      at: parseInt(obj.mostRecentAt, 10),
    },
  ]
    // remove any existing instances so we don't try to come back to it later
    .concat(unread.filter(u => u.id !== obj.id || u.uri !== obj.uri));

  unread.sort((a, b) => (a.at > b.at ? -1 : 1));
}

/**
 * get the next unread chat and/or thread
 *
 * @return {Object}
 */
function nextUnread() {
  return unread.shift();
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
  const c = _chat(chat);
  if (!c.threads || ignoreCache || c.refreshNext) {
    c.refreshNext = false;
    c.threads = await fetchThreads(chat, timestamp.now());
  }

  return c.threads;
}

/**
 * this never caches fetched threads,
 * assumes chat does not exist in cache
 *
 * @param {unpack.chat} chat
 */
function preview(chat) {
  return fetchThreads(chat);
}

/**
 * threads are fetched based on the most recent message sent to it
 * meaning that as time progresses we don't have a "static" pagination
 * it's constantly a moving target.
 * so we do our best to "merge" things and hope for the best
 * i hope you never want to see really old threads in an active chat
 *
 * @param {unpack.chat} chat
 */
async function moreThreads(chat) {
  // you've called this before threads() ಠ_ಠ
  if (!cache[chat.uri].threads) {
    return threads(chat);
  }

  const c = _chat(chat);
  const before = timestamp.more(c.threads[0].mostRecentAt);
  const more = await fetchThreads(chat, before);
  // dedupe threads
  // this is going to be slow when number of threads gets large :(
  c.threads = more.concat(c.threads).reduce((acc, thread) => {
    if (!acc.find(t => t.id === thread.id)) {
      acc.push(thread);
    }
    return acc;
  }, []);

  return c.threads;
}

/**
 * fetch threads for a non-dm chat
 *
 * @param {unpack.chat} chat
 * @param {String} before - @see timestamp.now()
 * @param {Boolean} preview [default: false]
 *
 * @return {Array<unpack.thread>}
 */
function fetchThreads(chat, before, preview = false) {
  if (chat.isDm) {
    throw new Error('threads called on a dm');
  }

  return getChatThreads(chat, before, preview).then(ts => {
    const unpacked = ts.map(unpack.thread).filter(t => !t.isMembershipUpdate);
    // we have to let the users cache know about all the users we just saw
    // so that when we go to display them we fetch all at once
    unpacked.forEach(t => t.messages.forEach(m => User.prefetch(m.user)));

    return unpacked;
  });
}

/**
 * get messages for a chat or thread.
 *
 * @param {unpack.chat|unpack.thread} obj
 * @param {Boolean} ignoreCache
 */
async function messages(obj, ignoreCache = false) {
  // obj is unpack.chat
  if (obj.isDm) {
    if (!cache[obj.uri].messages || ignoreCache) {
      cache[obj.uri].messages = await fetchMessages(obj, timestamp.now());
    }

    return cache[obj.uri].messages;
  }

  if ('isDm' in obj) {
    throw Error('called messages() on a room');
  }

  // obj is unpack.thread
  const thread = _thread(obj.room, obj);
  if (!thread.messages || thread.refreshNext || ignoreCache) {
    // this mutates cache
    thread.refreshNext = false;
    thread.messages = await fetchMessages(obj, timestamp.now());
  }

  return thread.messages;
}

/**
 * do our darndest to return a cached thread
 *
 * @param {unpack.chat} c
 * @param {Integer} id
 */
function _thread(c, { id }) {
  const chat = _chat(c);
  if (!chat) {
    // we're previewing a chat + thread, so this is temporary
    return newThread(c, id);
  }

  // if we haven't called threads() yet, we can fake it
  // by instantiating a new thread by ourselves here
  // it will have a buuuunch of empty fields, but things that
  // rely on that should be resilient enough to handle it
  if (!chat.threads) {
    chat.threads = [newThread(c, id)];
    chat.refreshNext = true;
  }

  const idx = chat.threads.findIndex(t => t.id === id);
  if (idx === -1) {
    chat.threads.push(newThread(c, id));
    return chat.threads[chat.threads.length - 1];
  }
  // i can't be bothered to figure out if chat.threads.find() returns by value or reference
  return chat.threads[idx];
}

function newThread(chat, id) {
  return {
    id,
    room: { uri: chat.uri, id: chat.id, displayName: chat.displayName },
    messages: [],
    total: 0,
    refreshNext: true,
  };
}

function _chat({ uri }) {
  return cache[uri];
}

/**
 * fetch messages for a chat or thread
 *
 * @param {unpack.thread|unpack.chat} obj
 * @param {String} before - @see timestamp.now()
 */
function fetchMessages(obj, before) {
  return obj.isDm
    ? getChatMessages(obj, before).then(rawMessages => {
        // empty messages returns null
        if (rawMessages) {
          // each "message" looks like a single-message thread
          // so... let's flatten that
          const unpacked = rawMessages.map(m => unpack.message(m[4][0]));
          unpacked.forEach(u => User.prefetch(u.user));

          return unpacked;
        }

        return [];
      })
    : getThreadMessages(obj, before).then(rawMessages => {
        const messages = rawMessages.map(unpack.message);
        messages.forEach(m => User.prefetch(m.user));

        const thread = _thread(obj.room, obj);
        if (messages.length === thread.total) {
          // this mutates cache
          thread.unfetched = 0;
        }

        return messages;
      });
}

async function join(chat) {
  if (!cache[chat.uri]) {
    await setRoomMembership(chat, await User.whoami(), true);
    cache[chat.uri] = chat;
  }
}

async function leave(chat) {
  if (cache[chat.uri]) {
    await setRoomMembership(chat, await User.whoami(), false);
    delete cache[chat.uri];
  }
}

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
        const thread = _thread(evt.room, evt.thread);
        thread.messages.push(msg);
        thread.mostRecentAt = timestamp.now();
        thread.total++;
        thread.isUnread = true;

        markUnread(thread);
        // but we still want to tell screens/chats about it
        EE.emit('messages.new', {
          chat: _chat(evt.room),
          thread: thread,
        });
      } else {
        // if we haven't fetched dm messages yet, don't do so now
        // as we'll fetch them when we actually load that chat
        // TODO in the case of a DM from a new chat we've never seen before
        // we need to do something here... not sure what yet
        const c = _chat(evt.room);
        if (c.messages) {
          c.messages.push(msg);
          c.isUnread = true;
        }
        markUnread(c);
        EE.emit('messages.new', { chat: c });
      }
    } catch (e) {
      console.log(e);
    }
  });
});

module.exports = {
  getAll,
  getGrouped,
  threads,
  moreThreads,
  messages,
  nextUnread,
  markRead,
  markUnread,
  preview,
  join,
  leave,
};
