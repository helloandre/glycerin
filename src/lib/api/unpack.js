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
  return {
    hasMore: !t[4], // why is this inverted, gchat?
    threads: t[0].map(_thread),
  };
}

function _thread(t) {
  const messages = t[4].map(message);
  return {
    _raw: t,
    id: t[0][0],
    room: roomMeta(t[0][2]),
    mostRecentAt: t[1],
    mostRecentReadAt: t[2], // can be 0 if none read
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

function roomUsers(c) {
  // normal room
  if (c[17]) {
    return c[17].map(u => user(u, c[0]));
  }

  // group
  if (c[55]) {
    return c[55].map(u => user(u, c[0]));
  }

  return [];
}

function chat(c) {
  return {
    // _raw: c,
    ...roomMeta(c[0]),
    isUnread: c[6],
    isGroup: !!c[55],
    isThreaded: c[26] === null,
    // 0 === all messages
    // 1 === @'s + followed threads + new threads
    // 2 === @'s + followed threads
    // 3 === @'s
    nofityLevel: c[54],
    ...chatName(c),
    mostRecentAt: c[8],
    mostRecentReadAt: c[9],
    // seems to be duplicated in c[43]
    users: roomUsers(c),
  };
}

function fave(c) {
  return { ...chat(c), isFave: true };
}
// Groups look like DMs, but the "name" is a concatination
// of the members of the room
function chatName(c) {
  if (c[2]) {
    return {
      displayName: c[2],
      normalizedName: c[2].toLowerCase(),
    };
  }

  if (c[55]) {
    const names = c[55]
      .map(user)
      .map(u => u.firstName)
      .sort()
      .join(', '); //.substring(0, 15);
    return {
      displayName: names,
      normalizedName: names.toLowerCase(),
    };
  }

  return {
    displayName: 'Group Chat',
    normalizedName: 'group chat',
  };
}

function roomMeta(m) {
  return {
    uri: m[0],
    id: m[1],
    isDm: m[2] === 5, // 2 == room, 5 == dm
  };
}

function chats(cs) {
  return [].concat(
    (cs[2] || []).map(fave), // favorites
    cs[7].map(chat), // dms
    cs[8].map(chat), // rooms
    (cs[9] || []).map(chat).map(c => {
      c.isBot = true;
      return c;
    }) // bots
  );
}

/**
 * response from a /mutate endpoint
 */
function mutate(m) {
  return {
    ...message(m[2]),
    room: roomMeta(m[2][17][2][2]),
    thread: {
      id: m[2][17][2][0],
    },
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
    JSON.stringify(mainData, null, 2);
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
  return { ...base, unknown: true, _data: data };
}

function _withUUID(base, type, data) {
  switch (type) {
    // marked as read?
    case 3:
      return {
        ...base,
        _data: data[2],
        at: data[2][1],
      };
    // marked as read
    case 4:
      return {
        ...base,
        ..._event_thread(data[3][0]),
      };
    // new message
    case 6:
      return {
        ...base,
        ..._event_msg(data[5][0]),
        ..._event_thread(data[5][0][0]),
      };
    // message edit
    case 7:
      return {
        ...base,
        ..._event_msg(data[5][0]),
        ..._event_thread(data[5][0][0]),
      };
    // ???
    case 9:
      return {
        ...base,
        _data: data[6],
      };
    // star
    case 11:
      return {
        ...base,
        starred: data[8][1] === 1,
        _data: data[8],
      };
    // more complete message event, includes user/bot name?
    // does not appear for rooms, only DMS (confirm: only bots?)
    // new theory: "mobile alert set" as it appears simultaneously
    case 12:
      return {
        ...base,
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
    // number of unread in this room
    case 13:
      return {
        ...base,
        unreadCount: parseInt(data[10][0], 10),
        // another weird room shape
        ..._mark_read_room(data[10]),
      };
    case 16:
      return {
        ...base,
        something: data[14],
      };
    // toggle notifications
    case 18:
      return {
        ...base,
        notify: data[16][1][0] === 2,
        // another weird room shape
        room: {
          uri: `space/${data[16][0][0][0]}`,
          id: data[16][0][0][0],
        },
      };
    // emoji added to a message
    case 24:
      return {
        ...base,
        ..._event_thread(data[21][0][0]),
        emoji: data[21][1],
        message: {
          id: data[21][0][1],
        },
        // _data: data[21],
      };
    // shrug. seems to contain an array of some message contents, but no message ids
    case 28:
      return {
        ...base,
        _data: data[24],
      };
    // connection started / new session started
    case 33:
      return base;
    // ????? (maybe someone came online/offline?)
    case 45:
      return base;
  }
}

function _event_msg(msg) {
  return {
    // lastRead?: msg[2],
    mostRecent: msg[3],
    mostRecentAt: msg[3],
    createdAt: msg[3],
    message: {
      id: msg[13],
    },
    text: {
      raw: msg[9],
      formatting: msg[10]
        ? msg[10].map(fmt => ({
            unknownValue: fmt[0],
            rawIndex: fmt[1],
            length: fmt[2],
            // 5 == monospace text (inside `)
            // 6 == `
            // 7 == block text (inside ```)
            type: fmt[7] ? fmt[7][0] : null,
            link: fmt[6]
              ? {
                  prefetchTitle: fmt[6][0],
                  raw: fmt[6][6][2],
                  domain: fmt[6][7],
                }
              : null,
          }))
        : [],
    },
    user: {
      name: typeof msg[1] === 'string' ? msg[1] : undefined,
      id: msg[1][0][0],
    },
  };
}

function _event_thread(data) {
  // try to figure out the shape of things
  if (typeof data[1] === 'string') {
    if (!data[0]) {
      return {
        room: {
          uri: `space/${data[2][0][0]}`,
          id: data[2][0][0],
        },
        thread: {
          id: data[1],
        },
      };
    }

    // either a DM or a new thread
    if (data[1] === data[0][3][1]) {
      if (data[0][3][2].length === 1) {
        return {
          room: {
            uri: `space/${data[0][3][2][0][0]}`,
            id: data[0][3][2][0][0],
          },
          thread: {
            id: data[0][3][1],
          },
        };
      }

      return {
        room: {
          uri: `dm/${data[0][3][2][2][0]}`,
          id: data[0][3][2][2][0],
        },
      };
    }

    return {
      room: {
        uri: `space/${data[0][3][2][0][0]}`,
        id: data[0][3][2][0][0],
      },
      thread: {
        id: data[0][3][1],
      },
    };
  }

  if (data[3]) {
    return {
      room: {
        uri: `space/${data[3][2][0][0]}`,
        id: data[3][2][0][0],
      },
      thread: {
        id: data[3][1],
      },
    };
  }

  // events that are room-centric not thread-centric
  return {
    room: {
      uri: `space/${data[2][0][0]}`,
      id: data[2][0][0],
    },
  };
}

function _mark_read_room(obj) {
  if (obj[2][2]) {
    return {
      room: {
        uri: `dm/${obj[2][2][0]}`,
        id: obj[2][2][0],
      },
    };
  }

  return {
    room: {
      uri: `space/${obj[2][0][0]}`,
      id: obj[2][0][0],
    },
  };
}

function availableRooms(rooms) {
  return rooms.map(room => ({
    ...roomMeta(room[0]),
    displayName: room[1],
    normalizedName: room[1].toLowerCase(),
    memberCount: room[2],
    createdAt: room[3],
    searchPreview: true,
    // ?: room[4] // Boolean. has unread?
  }));
}

module.exports = {
  chats,
  thread,
  user,
  message,
  event,
  mutate,
  availableRooms,
};
