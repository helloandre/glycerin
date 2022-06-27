const EE = require('./eventemitter');
const Chat = require('./model/chat');
const User = require('./model/user');
const timestamp = require('./timestamp');

/**
 * State
 */
const _chats = {};
const _threads = {};
let _active = {
  chat: false,
  thread: false,
  search: false,
};
const _search = {
  mode: false,
  available: [],
};
let _unread = [];
let _last = [];

function _fetchChats() {
  return Chat.fetchChats().then(cs => {
    cs.forEach(chat => {
      _chats[chat.uri] = chat;
      if (chat.isUnread) {
        markUnread(chat);
      }
    });
  });
}

function _fetchThreads(chat, tsp) {
  _chats[chat.uri].loading = true;

  return Chat.fetchThreads(chat, tsp).then(ts => {
    _chats[chat.uri].loading = false;
    _chats[chat.uri].hasMoreThreads = ts.hasMore;
    if (!_threads[chat.uri]) {
      _threads[chat.uri] = {};
    }
    ts.threads.forEach(t => {
      _threads[chat.uri][t.id] = t;
    });
    // for when we need to fetch more
    _chats[chat.uri].moreTimestamp = timestamp.more(ts.threads[0].mostRecentAt);
  });
}

async function _selectChat(chat) {
  if (!_chats[chat.uri]) {
    await Chat.fetchDetails(chat).then(deets => {
      _chats[chat.uri] = deets;
    });
  }

  _active.chat = chat.uri;
  _chats[chat.uri].loading = true;
  EE.emit('state.chats.loading');

  if (chat.isDm) {
    _active.thread = false;
    return Chat.fetchMessages(chat, timestamp.now()).then(msgs => {
      _chats[chat.uri].loading = false;
      _chats[chat.uri].messages = msgs;
      markRead();
    });
  } else {
    return _fetchThreads(chat, timestamp.now())
      .then(markRead)
      .then(() => {
        ts = threads();
        // always load the bottom one
        if (ts && ts.threads.length) {
          _selectThread(ts.threads[ts.threads.length - 1]);
        }
      });
  }
}

function _selectThread(t) {
  _active.thread = t.id;
  markRead();
}

/**
 * let the server know we've seen this chat and/or thread
 */
function markRead() {
  const c = chat();
  if (!c) {
    return;
  }

  _chats[c.uri].isUnread = false;
  const idx = _unread.findIndex(u => u.uri === c.uri);
  // this chat is not unread, bail
  if (idx === -1) {
    return;
  }

  if (c.isDm) {
    Chat.markRead(c);
  } else {
    const t = thread();
    // we don't have a thread selected yet, nothing to "read"
    if (!t) {
      return;
    }
    _threads[c.uri][t.id].isUnread = false;
    Chat.markRead(t);

    // this causes the chats to jump around too much
    // // if there's any other threads in this chat that are unread
    // // put this chat back into unread at the proper place
    // const unreadThreads = threads().threads.filter(t => t.isUnread);
    // if (unreadThreads.length > 1) {
    //   markUnread(c, unreadThreads[1].mostRecentAt);
    // }
  }

  // TODO this is a naive removement of the first instance of chat
  // from _unread, but that is probably the incorrect behavior
  _unread.splice(idx, 1);
}

/**
 * Something about this chat is unread
 * we'll sort out exactly what when we render it
 *
 * @param {unpack.chat} chat
 * @param {timestamp} mostRecentAt
 */
function markUnread(chat, mostRecentAt = false) {
  _chats[chat.uri].isUnread = true;
  if (mostRecentAt) {
    // TODO this is the wrong behavior for sorting chats by .mostRecentAt
    // we need a .mostRecentUnreadAt
    _chats[chat.uri].mostRecentAt = mostRecentAt;
  }

  _unread.push(chat);
  // TODO it might be more efficient to sort when we're looking or the next unread
  _unread.sort((a, b) => (a.mostRecentAt > b.mostRecentAt ? -1 : 1));
}

/**
 * Event Callbacks
 */

EE.on('screen.ready', () => {
  // fetch only once, rely on events incomming to update any state
  _fetchChats().then(() => {
    EE.emit('state.chats.updated');
    EE.emit('state.fetched');
  });
});

EE.on('search.local', () => {
  _search.available = chats();
  _active.search = true;
  _search.mode = 'local';

  EE.emit('state.search.updated');
});
EE.on('search.remote', () => {
  _active.search = true;
  _search.mode = 'remote';
  _search.loading = true;
  EE.emit('state.search.updated');

  Chat.fetchAvailableChats().then(available => {
    _search.available = available;
    _search.loading = false;
    EE.emit('state.search.updated');
  });
});
EE.on('search.preview', chat => {
  _selectChat(chat).then(() => {
    EE.emit('state.threads.updated');
  });
});
EE.on('search.close', () => {
  _active.search = false;
  _active.chat = false;
  _active.thread = false;
  EE.emit('state.search.updated');
  EE.emit('state.chats.updated');
});
EE.on('search.select', chat => {
  _active.search = false;

  const p =
    _search.mode === 'local'
      ? _selectChat(chat)
      : Chat.join(chat).then(() => _selectChat(chat));

  p.then(() => {
    EE.emit('state.search.updated');
    EE.emit('state.chats.updated');
    EE.emit('state.threads.updated');
  });
});
EE.on('chats.select', chat => {
  _selectChat(chat).then(() => {
    EE.emit('state.chats.updated');
    EE.emit('state.messages.updated');
    EE.emit('state.threads.updated');
  });
});
EE.on('chats.leave', chat => {
  Chat.leave(chat).then(() => {
    delete _chats[chat.uri];
    EE.emit('state.chats.updated');
  });
});
EE.on('threads.select', t => {
  _selectThread(t);
  EE.emit('state.threads.updated');
  EE.emit('state.messages.updated');
});
EE.on('threads.blur', () => {
  _active.thread = false;
  _active.chat = false;

  EE.emit('state.search.updated');
  EE.emit('state.chats.updated');
  EE.emit('state.threads.updated');
});
EE.on('threads.fetchMore', () => {
  const c = chat();
  _fetchThreads(c, c.moreTimestamp).then(() => {
    if (c.isThreaded) {
      EE.emit('state.threads.updated');
    } else {
      EE.emit('state.messages.updated');
    }
  });
});
EE.on('state.pop', () => {
  if (_last.length) {
    _last.push(_active);
    _active = { ..._last.shift() };
    EE.emit('state.chats.updated');
    EE.emit('state.threads.updated');
    EE.emit('state.messages.updated');
  }
});
EE.on('input.blur', (toChats = false) => {
  const c = chat();
  // not sure how this is possible yet, but seen it once
  if (!c) {
    return;
  }

  if (c.isDm || !c.isThreaded || toChats) {
    _active.thread = false;
    _active.chat = false;
  } else {
    _active.thread = false;
  }

  EE.emit('state.threads.updated');
  EE.emit('state.messages.updated');
  EE.emit('state.chats.updated');
});
EE.on('messages.expand', () => {
  const t = thread();
  if (t && t.unfetched > 0) {
    _threads[t.room.uri][t.id].loading = true;
    EE.emit('state.messages.updated');

    Chat.fetchMessages(t, timestamp.now()).then(msgs => {
      _threads[t.room.uri][t.id].loading = false;
      _threads[t.room.uri][t.id].messages = msgs;
      _threads[t.room.uri][t.id].unfetched = thread().total - msgs.length;
      EE.emit('state.messages.updated');
    });
  }
});
EE.on('unread.next', () => {
  if (_unread.length) {
    // TODO config to read from start or end of _unread
    const next = _unread[0];
    _selectChat(next).then(() => {
      if (next.isThreaded) {
        const ts = threads().threads;
        const unreadThreads = ts.filter(t => t.isUnread);
        // edge case while i was testing with two windows open:
        // we might have a new message but no unread threads
        // so assume the "newest" thread
        if (!unreadThreads.length) {
          _active.thread = ts.pop().id;
        } else {
          _active.thread = unreadThreads[0].id;
        }
        markRead(next);

        // if this chat has a different thread that is also unread
        // put it back into the correct place in _unread
        if (unreadThreads.length > 1) {
          markUnread(next, unreadThreads[1].mostRecentAt);
        }
      }

      EE.emit('state.chats.updated');
      EE.emit('state.threads.updated');
      EE.emit('state.messages.updated');
    });
  }
});

EE.once('state.fetched', () => {
  // new message
  EE.on('events.6', async evt => {
    const c = _chats[evt.room.uri];
    if (!c) {
      // if we don't have this room, bail bail bail
      // and let the "redraw the world" process take over
      // which... i mean... we could always do, but this is
      // an expensive call so we should try not to do it a lot
      await _fetchChats();
      // no need to mark anythign here, _fetchChats handles that
    } else {
      if (c.isDm) {
        if (c.messages) {
          c.messages.push(evt);
        }

        if (c.uri !== _active.chat) {
          markUnread(c, evt.mostRecentAt);
        } else {
          _chats[c.uri].mostRecentAt = evt.mostRecentAt;
        }
      } else {
        if (_threads[c.uri]) {
          if (c.isThreaded) {
            if (!_threads[c.uri][evt.thread.id]) {
              // if this is a new thread, or someone resurrecting an old one
              // take the slightly nuclear option
              await _fetchThreads(c);
            } else {
              // let the User be preloaded if we haven't seen it yet
              evt.user.room = evt.room;
              User.prefetch(evt.user);

              _threads[c.uri][evt.thread.id] = {
                ..._threads[c.uri][evt.thread.id],
                messages: _threads[c.uri][evt.thread.id].messages.concat(evt),
                mostRecentAt: evt.mostRecentAt,
                isUnread: _active.thread != evt.thread.id,
                total: _threads[c.uri][evt.thread.id].total + 1,
              };
            }
          } else {
            // let the User be preloaded if we haven't seen it yet
            evt.user.room = evt.room;
            User.prefetch(evt.user);

            // unthreaded spaces look like threads but each thread only has one message
            _threads[c.uri][evt.thread.id] = {
              messages: [evt],
              mostRecentAt: evt.mostRecentAt,
              isUnread: _active.thread != evt.thread.id,
            };
          }
        }

        if (c.isThreaded && evt.thread && evt.thread.id !== _active.thread) {
          markUnread(c, evt.mostRecentAt);
        } else {
          _chats[c.uri].mostRecentAt = evt.mostRecentAt;
        }
      }
    }

    // TODO i wonder if this will cause issues when in the middle of typing a message?
    EE.emit('state.chats.updated');
    EE.emit('state.threads.updated');
    EE.emit('state.messages.updated');
  });
});

/**
 * State Accessors
 */

function chats() {
  if (_active.search && _search.mode === 'remote') {
    return _search.available;
  }

  return Object.entries(_chats)
    .map(([_, val]) => val)
    .sort((a, b) =>
      a.isFave || b.isFave ? 0 : a.mostRecentAt > b.mostRecentAt ? -1 : 1
    );
}

function chat() {
  return _chats[_active.chat];
}

function threads() {
  const c = chat();
  if (!c || !c.isThreaded) {
    return false;
  }

  if (c.loading) {
    return { loading: true, threads: [] };
  }

  return {
    loading: false,
    threads: Object.entries(_threads[_active.chat])
      .map(([_, val]) => val)
      .sort((a, b) => (a.mostRecentAt > b.mostRecentAt ? 1 : -1))
      .filter(t => !t.isMembershipUpdate),
  };
}

function thread() {
  return _active.chat &&
    _active.thread &&
    _threads[_active.chat] &&
    _threads[_active.chat][_active.thread]
    ? _threads[_active.chat][_active.thread]
    : false;
}

function messages() {
  if (!_active.chat) {
    return false;
  }

  const c = chat();
  if (c.isDm) {
    return c;
  } else if (!c.isThreaded) {
    if (!_threads[_active.chat]) {
      return false;
    }

    if (c.isLoading) {
      return c;
    }

    // groups look like rooms, but each message is a new thread
    return Object.entries(_threads[_active.chat]).reduce(
      (acc, [_, t]) => {
        if (!acc.messages) {
          acc.messages = t.messages;
        } else {
          acc.messages = acc.messages.concat(t.messages);
        }
        return acc;
      },
      {
        hasMore: !c.isThreaded && c.hasMoreThreads,
      }
    );
  } else {
    return thread();
  }
}

function search() {
  return _active.search && _search;
}

module.exports = {
  chat,
  chats,
  thread,
  threads,
  messages,
  search,
};
