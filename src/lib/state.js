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

function _selectChat(chat) {
  _active.chat = chat.uri;
  if (chat.isDm) {
    // TODO
    return;
  } else {
    EE.emit('threads.activate');
    // TODO check cache
    Chat.fetchThreads(chat, timestamp.now()).then(ts => {
      _threads[chat.uri] = {};
      ts.forEach(thread => {
        _threads[chat.uri][thread.id] = thread;
      });
      EE.emit('threads.update');
    });
  }
}

function markUnread(obj) {
  // put this object at the front of unread
  _unread = [
    {
      id: obj.id,
      uri: obj.uri,
      isDm: obj.isDm,
      at: parseInt(obj.mostRecentAt, 10),
    },
  ]
    // remove any existing instances so we don't try to come back to it later
    .concat(unread.filter(u => u.id !== obj.id || u.uri !== obj.uri))
    .sort((a, b) => (a.at > b.at ? -1 : 1));
}

/**
 * Event Callbacks
 */

EE.on('screen.ready', () => {
  // fetch only once, rely on events incomming to update any state
  _fetchChats().then(() => {
    EE.emit('chats.activate');
    EE.emit('chats.update');
  });
});
EE.on('search.local', () => {
  _active.search = true;
  _search.mode = 'local';
  EE.emit('search.activate');
  EE.emit('search.update');
});
EE.on('search.remote', () => {
  _active.search = true;
  _search.mode = 'remote';
  EE.emit('search.activate');

  Chat.fetchAvailableChats().then(available => {
    _search.available = available;
    EE.emit('search.update');
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
  Chat.join(chat).then(() => {
    EE.emit('working.deactivate');
    EE.emit('chats.select', chat);
  });
});
EE.on('chats.select', chat => {
  _selectChat(chat);
});
EE.on('threads.preview', thread => {
  _active.thread = thread.id;
  EE.emit('messages.update');
});
EE.on('threads.select', thread => {
  _active.thread = thread.id;
  EE.emit('messages.update');
  EE.emit('input.focus');
});
EE.on('threads.blur', () => {
  _active.thread = false;
  _active.chat = false;
  EE.emit('threads.update');
  EE.emit('messages.update');

  if (_active.search) {
    EE.emit('search.reactivate');
  }
});
EE.on('messages.expand', () => {
  Chat.fetchMessages(_threads[_active.thread], timestamp.now()).then(msgs => {
    _threads[thread.room.uri][thread.id].messages = msgs;
    EE.emit('messages.update');
  });
});
EE.on('unread.next', () => {
  if (_unread.length) {
    const next = _unread.shift();
    _active.chat = next.uri;
    _active.thread = next.isDm ? next.id : false;

    _refresh();
  }
});

EE.once('chats.update', () => {
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

      if (chat.isDm) {
        chat.messages = (c.messages || []).concat(msg);
        chat.isUnread = true;

        _chats[chat.uri] = chat;
        markUnread(chat);
      } else {
        const thread = _threads[evt.thread.id]
          ? _threads[evt.thread.id]
          : {
              id,
              room: {
                uri: chat.uri,
                id: chat.id,
                displayName: chat.displayName,
              },
              messages: [],
              total: 0,
            };

        thread.messages.push(msg);
        thread.mostRecentAt = timestamp.now();
        thread.total++;
        thread.isUnread = true;

        _threads[thread.id] = thread;

        markUnread(thread);
      }
    }

    EE.emit('chats.update');
    EE.emit('threads.update');
    EE.emit('messages.update');
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
  if (!_active.chat) {
    return false;
  }

  return Object.entries(_threads[_active.chat])
    .map(([_, val]) => val)
    .sort((a, b) => (a.mostRecentAt > b.mostRecentAt ? -1 : 1));
}

function messages() {
  if (!_active.thread) {
    return false;
  }

  if (_active.chat.isDm) {
    return;
  } else {
    return _threads[_active.chat][_active.thread];
  }
}

module.exports = {
  chat,
  chats,
  threads,
  messages,
};
