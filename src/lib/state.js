const EE = require('./eventemitter');
const Chat = require('./model/chat');
const User = require('./model/user');
const timestamp = require('./timestamp');

/**
 * State
 */
const _chats = {};
const _threads = {};
const _active = {
  chat: false,
  thread: false,
  search: false,
};
const _search = {
  mode: false,
  available: [],
};
let _unread = [];

function _refresh() {
  EE.emit('chats.update');
  EE.emit('threads.update');
  EE.emit('messages.update');
}

function _fetchChats() {
  return Chat.fetchChats().then(cs => {
    cs.forEach(chat => {
      _chats[chat.uri] = chat;
    });
  });
}

function _fetchThreads(chat, tsp) {
  _chats[chat.uri].loading = true;

  Chat.fetchThreads(chat, tsp).then(ts => {
    _chats[chat.uri].loading = false;
    _chats[chat.uri].hasMoreThreads = ts.hasMore;
    _threads[chat.uri] = {};
    ts.threads.forEach(t => {
      _threads[chat.uri][t.id] = t;
    });
    // for when we need to fetch more
    _chats[chat.uri].moreTimestamp = timestamp.more(ts.threads[0].mostRecentAt);

    if (chat.isThreaded) {
      EE.emit('state.threads.updated');
    } else {
      EE.emit('state.messages.updated');
    }
  });
}

function _selectChat(chat) {
  _active.chat = chat.uri;
  _chats[chat.uri].loading = true;
  EE.emit('state.chats.loading');

  if (chat.isDm) {
    Chat.fetchMessages(chat, timestamp.now()).then(msgs => {
      _chats[chat.uri].loading = false;
      _chats[chat.uri].messages = msgs;
      EE.emit('state.messages.updated');
    });
  } else {
    _fetchThreads(chat, timestamp.now());
  }
}

function markUnread(obj) {
  // put this object at the front of unread
  _unread = [
    {
      id: obj.id,
      uri: obj.uri || obj.room.uri,
      isDm: !!obj.isDm,
      at: parseInt(obj.mostRecentAt, 10),
    },
  ]
    // remove any existing instances so we don't try to come back to it later
    .concat(_unread.filter(u => u.id !== obj.id || u.uri !== obj.uri))
    .sort((a, b) => (a.at > b.at ? -1 : 1));
}

function markRead(obj) {
  const beforeLen = unread.length;
  unread = unread.filter(o => o.id !== obj.id || o.uri !== obj.uri);
  // if it's not in our unread queue, nothing to do here...
  if (beforeLen !== unread.length) {
    // fire and forget
    Chat.markRead(obj);

    if (obj.isDm) {
      _chats[obj.uri].isUnread = false;
    } else {
      _threads[obj.uri][obj.id].isUnread = false;
    }
  }
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
  _active.search = true;
  _search.mode = 'local';
  EE.emit('search.activate');
  EE.emit('search.bootstrap');
});
EE.on('search.remote', () => {
  _active.search = true;
  _search.mode = 'remote';
  EE.emit('search.activate');

  Chat.fetchAvailableChats().then(available => {
    _search.available = available;
    EE.emit('search.bootstrap');
  });
});
EE.on('search.preview', chat => {
  _selectChat(chat);
});
EE.on('search.close', chat => {
  _active.search = false;
  // come from somewhere else
  EE.emit('chats.activate');
});
EE.on('search.select', chat => {
  _active.search = false;
  EE.emit('working.activate');

  if (_search.mode === 'local') {
    _selectChat(chat);
  } else {
    Chat.join(chat).then(() => {
      EE.emit('working.deactivate');
      _selectChat(chat);
    });
  }
});
EE.on('chats.select', chat => {
  _selectChat(chat);
});
EE.on('threads.preview', t => {
  _active.thread = t.id;
  EE.emit('messages.update');
});
EE.on('threads.select', t => {
  _active.thread = t.id;
  EE.emit('state.messages.updated');
});
EE.on('threads.blur', () => {
  _active.thread = false;
  _active.chat = false;

  if (_active.search) {
    EE.emit('search.reactivate');
  } else {
    EE.emit('chats.activate');
  }

  EE.emit('state.chats.updated');
  EE.emit('state.threads.updated');
});
EE.on('threads.fetchMore', () => {
  const c = chat();
  _fetchThreads(c, c.moreTimestamp);
});
EE.on('input.blur', () => {
  const c = chat();
  if (c.isDm || !c.isThreaded) {
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
    EE.emit('messages.update');

    Chat.fetchMessages(t, timestamp.now()).then(msgs => {
      _threads[t.room.uri][t.id].loading = false;
      _threads[t.room.uri][t.id].messages = msgs;
      _threads[t.room.uri][t.id].unfetched = thread().total - msgs.length;
      EE.emit('messages.update');
    });
  }
});
EE.on('unread.next', () => {
  if (_unread.length) {
    const next = _unread.shift();
    _active.chat = next.uri;
    _active.thread = next.isDm ? next.id : false;

    _refresh();
  }
});

EE.once('state.fetched', () => {
  // new message
  EE.on('events.6', async evt => {
    const chat = _chats[evt.room.uri];
    if (!chat) {
      // if we don't have this room, bail bail bail
      // and let the "redraw the world" process take over
      // which... i mean... we could always do, but this is
      // an expensive call so we should try not to do it a lot
      await _fetchChats();
    } else {
      // let the User be preloaded if we haven't seen it yet
      evt.user.room = evt.room;
      User.prefetch(evt.user);

      const msg = {
        ...evt,
        isUnread: true,
      };

      chat.isUnread = true;

      if (chat.isDm) {
        chat.messages = (c.messages || []).concat(msg);

        _chats[chat.uri] = chat;
        // markUnread(chat);
      } else {
        if (!_threads[chat.uri]) {
          _threads[chat.uri] = {};
        }

        if (!_threads[chat.uri][evt.thread.id]) {
          _threads[chat.uri][evt.thread.id] = {
            id: evt.thread.id,
            room: {
              uri: chat.uri,
              id: chat.id,
              displayName: chat.displayName,
            },
            messages: [],
            total: 0,
          };
        }

        _threads[chat.uri][evt.thread.id] = {
          ..._threads[chat.uri][evt.thread.id],
          messages: _threads[chat.uri][evt.thread.id].messages.concat(msg),
          mostRecentAt: timestamp.now(),
          total: _threads[chat.uri][evt.thread.id].total + 1,
          isUnread: true,
        };

        // markUnread(_threads[chat.uri][evt.thread.id]);
      }
    }

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
  if (!_active.chat || !chat().isThreaded) {
    return false;
  }

  if (chat().loading) {
    return { loading: true, threads: [] };
  }

  return {
    loading: false,
    threads: Object.entries(_threads[_active.chat])
      .map(([_, val]) => val)
      .sort((a, b) => (a.mostRecentAt > b.mostRecentAt ? 1 : -1)),
  };
}

function thread() {
  return _active.chat && _active.thread
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

module.exports = {
  chat,
  chats,
  thread,
  threads,
  messages,
};
