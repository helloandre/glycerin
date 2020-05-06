/**
 * This is the fun/worst part of the project.
 *
 * Here is the "documentation" about what kinds of objects
 * exist in the API that powers the GUI for google chat.
 *
 * This will likely evolve over time as the understanding of
 * objects improves/changes.
 */

function thread(t) {
  const messages = t[4].map(message);
  return {
    _raw: t,
    id: t[0][0],
    room: roomMeta(t[0][2]),
    mostRecentAt: t[1],
    mostRecentReadAt: t[2],
    messages,
    isUnread: messages.filter(m => m.isUnread).length,
    unfetched: t[6],
    total: t[4].length + t[6],
    // t[12] is some kind of timestamp
    // t[14] is some kind of timestamp
    // t[16] is some kind of timestamp, but not in string format
    isMembershipUpdate: t[23], // we ignore these kinds of threads
    // t[26] is something related to thread count
    // possibly something about "initially loaded" count?
    // for single-message threads, it's 0
    // initiallyLoaded: t[26]
  };
}

function message(msg) {
  return {
    id: msg[1],
    user: user(msg[4], msg[2]),
    text: {
      raw: msg[5],
      // msg[8] is some kind of metadata about mentions / urls
      links: msg[8],
      // msg[9] is the parts of the message broken up into "regular text" and "links/mentions"
      parts: msg[9],
    },
    createdAt: msg[11],
    isUnread: msg[14],
    // in int format
    // createdAt: msg[16]
    // threadish: msg[17] seems to be thread+room again...
    isSecret: msg[24],
    reactions: msg[39], // may be undefined
  };
}

function user(u, r) {
  return {
    id: u[0],
    uri: u[9][1],
    name: u[1],
    icon: u[2],
    email: u[3],
    firstName: u[6],
    room: r ? roomMeta(r) : null,
  };
}

function chat(c) {
  return {
    _raw: c,
    ...roomMeta(c[0]),
    isUnread: c[6],
    // not sure about these, but these are the indexes
    // that change from null -> true between chats
    // that should and shouldn't alert
    // shouldAlert: c[28] || c[33],
    displayName: c[2],
    mostRecentAt: c[8],
    mostRecentReadAt: c[9],
    user: c[17] ? user(c[17][0], c[0]) : null,
  };
}
function fave(c) {
  return { ...chat(c), isFave: true };
}

function roomMeta(m) {
  return {
    uri: m[0],
    id: m[1],
    isDm: m[2] === 5, // 2 == room, 5 == dm
  };
}

function chats(cs) {
  return {
    // cs[0] seems to be some kind of aggregation of all rooms?
    // but it doesn't include favorites
    favorites: cs[2].map(fave),
    dms: cs[7].map(chat),
    rooms: cs[8].map(chat),
    bots: cs[9].map(chat),
    // dmsClosed: cs[15]
  };
}

/**
 * Events seem to follow a whole different logic than the other endpoints.
 * It's not super clear how to tell nested events objects from each other
 * and especially the _withUUID thing seems... wrong, but it "works"
 */

function event(evt) {
  const base = {
    AID: evt[0],
    isNoop: false,
  };

  // [[1,["noop"]]]
  if (typeof evt[1][0] === 'string') {
    return {
      ...base,
      isNoop: true,
      str: evt[1][0],
    };
  }

  const mainData = evt[1][0][0][7][0];
  const type = mainData[11];
  // @TODO figure out why some events have a UUID in this position
  const hasUUID = typeof evt[1][0][1] === 'string';
  base._raw = mainData;
  base._type = type;
  base._hasUUID = hasUUID;

  let unpacked;
  try {
    unpacked = hasUUID
      ? _withUUID(base, type, mainData)
      : _roomEvent(base, type, mainData);
  } catch (e) {
    console.log(e);
    unpacked = {
      error: true,
      ...base,
    };
  }

  return (
    unpacked || {
      // default, but really we don't know/care what this is
      ...base,
      isNoop: true,
      isUnknown: true,
    }
  );
}

function _roomEvent(base, type, data) {
  switch (type) {
    // ?? something about the room, appears after a message sent
    // case 3
    // ?? marked as read update?
    // case 4:
    // text update
    case 6:
      return {
        ...base,
        text: {
          raw: data[5][0][9],
        },
        room: {
          meta: {
            // @TODO confirm
            uri: `space/${data[5][0][0][0][3][1]}`,
            id: data[5][0][0][0][3][1],
          },
        },
        thread: {
          id: data[5][0][0][0][3][2][0][0],
        },
      };
    // ?? something room + thread
    // case 9:
    // ?? likely just a ping? no actual data included
    // case 33:
  }
}

function _withUUID(base, type, data) {
  switch (type) {
    // most recently read?
    // case 3:
    // likely "sent by current user"
    case 6:
      return {
        ...base,
        // update to interesting data
        _raw: data[5],
        /**
         * 5:
         *    3: "0",
         *    5: 1,
         * 5 > 0:
         *    19: 1
         *    23: 0
         *    24: 0
         */
        ..._event_msg(data[5][0]),
        thread: {
          id: data[5][0][0][1],
        },
        user: {
          id: data[5][0][1][0][0],
          // ?: data[5][0][1][0][1], -> 1
        },
      };
    // more complete message event, includes user/bot name?
    // doe not appear for rooms, only DMS (confirm: only bots?)
    case 12:
      return {
        ...base,
        _raw: data[9],
        /**
         * 9:
         *    1: 0
         *
         */
        ..._event_msg(data[9][0]),
        thread: {
          id: data[9][0][0][0][1],
        },
        user: {
          name: data[9][0][1],
          // avatar: data[9][0][2],
          // ?: data[9][0][4], -> 1 // is bot?
        },
      };
    // seems to be duplicate of 3
    // case 13:
  }
}

function _event_msg(msg) {
  const r = msg[0][0][3] ? msg[0][0][3][2][2][0] : msg[0][0][0][3][2][2][0];
  const t = msg[0][0][0] ? msg[0][0][0][1] : msg[0][0][1];
  const u = {
    name: typeof msg[1] === 'string' ? msg[1] : undefined,
    id: msg[1][0][0],
  };
  return {
    text: {
      raw: msg[9],
    },
    room: {
      meta: {
        uri: `space/${r}`,
        id: r,
      },
    },
    thread: {
      id: t,
    },
    user: u,
  };
}

module.exports = {
  chats,
  thread,
  user,
  message,
  event,
};
