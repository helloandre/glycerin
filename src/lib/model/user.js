const getUsers = require('../api/get-users');
const wai = require('../api/whoami');
const unpack = require('../api/unpack');

const cache = {};
let dirty = [];
let _self;

/**
 * fetch a result from a "whoami" api
 */
async function whoami() {
  if (!_self) {
    _self = await wai().then(unpack.user);
    if (!cache[_self.id]) {
      cache[_self.id] = _self;
    }
  }

  return _self;
}

/**
 * Tell the cache about a user we've seen in a thread/dm
 * we then lazily collect all users we haven't seen yet in dirty
 * and fetch them as late as possible (on first call to name())
 *
 * @param {unpack.user} user
 *
 * @return {void}
 */
function prefetch(user) {
  // if we've got a DM, the user comes already fetched
  if (user.name && user.name.length) {
    cache[user.id] = user;
  }

  // otherwise it's a user stub and we'll need to fetch later
  if (!cache[user.id]) {
    dirty.push(user);
  }
}

/**
 * go get any users in dirty
 */
async function fetch() {
  if (dirty.length) {
    const users = await getUsers(dirty);
    users.forEach(u => {
      const unpacked = unpack.user(u[1][1]);
      cache[unpacked.id] = unpacked;
    });
    dirty = [];
  }
}

/**
 * wait for any users to be fetched, then return
 * the now-guaranteed-to-be-in-cache user's name
 * fetch() is a no-op if no users need to be fetched
 *
 * @param {unpack.user} user
 *
 * @return {String}
 */
function name(user) {
  return fetch().then(() => cache[user.id].name);
}

module.exports = {
  prefetch,
  name,
  whoami,
};
