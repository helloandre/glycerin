const timestamp = require('../timestamp');
const getChats = require('../api/get-chats');
const getAvailableRooms = require('../api/get-available-rooms');
const getChatThreads = require('../api/get-chat-threads');
const getChatMessages = require('../api/get-chat-messages');
const getThreadMessages = require('../api/get-thread-messages');
const setRoomMembership = require('../api/set-room-membership');
const getSpaceDetails = require('../api/get-space-details');
const markReadAPI = require('../api/mark-read');
const unpack = require('../api/unpack');
const User = require('./user');

/**
 *
 * @returns Promise(Array<unpack.chat>)
 */
function fetchChats() {
  return getChats().then(unpack.chats);
}

function fetchAvailableChats() {
  return getAvailableRooms().then(unpack.availableRooms);
}

function fetchDetails(c) {
  return getSpaceDetails(c).then(unpack.chat);
}

/**
 * remove this object from our unread queue, potentially out of order
 * and tell the server that it's been read
 *
 * @param {unpack.chat|unpack.thread} obj
 */
function markRead(obj) {
  // fire and forget
  markReadAPI(obj);
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
    const unpacked = unpack.thread(ts);
    // we have to let the users cache know about all the users we just saw
    // so that when we go to display them we fetch all at once
    unpacked.threads.forEach(t =>
      t.messages.forEach(m => User.prefetch(m.user))
    );

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

/**
 * fetch messages for a chat or thread
 *
 * @param {unpack.thread|unpack.chat} obj
 * @param {String} before - @see timestamp.now()
 */
function fetchMessages(obj, before) {
  return obj.isDm || obj.isGroup
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

        // const thread = _thread(obj.room, obj);
        // if (messages.length === thread.total) {
        //   // this mutates cache
        //   thread.unfetched = 0;
        // }

        return messages;
      });
}

async function join(chat) {
  return setRoomMembership(chat, await User.whoami(), true);
}

async function leave(chat) {
  return setRoomMembership(chat, await User.whoami(), false);
}

module.exports = {
  markRead,
  join,
  leave,
  fetchChats,
  fetchDetails,
  fetchAvailableChats,
  fetchThreads,
  fetchMessages,
  moreThreads,
};
