const URL_DATA = 'https://chat.google.com/_/DynamiteWebUi/data';
const URL_MUTATE = 'https://chat.google.com/_/DynamiteWebUi/mutate';
const URL_EVENTS = 'https://chat.google.com/u/0/webchannel/events';
const URL_REGISTER = 'https://chat.google.com/u/0/webchannel/register';
const DEFAULT_HEADERS = {
  'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
  'User-Agent': 'glycerin-tui/0.0.1',
  accept: '*/*',
};

const ACTIONID_GET_CHATS = '115617451';
// _GET_CHAT_THREADS seems unnecessary.
// we COULD use _GET_CHAT_MESSAGES here as it returns the same threads + messages
// but with slightly more (as of yet unknown) metadata
// at any rate, we call this to populate the initial threads
// but need to call _MESSAGES to load *more*
// ¯\_(ツ)_/¯
const ACTIONID_GET_CHAT_THREADS = '120296683';
const ACTIONID_GET_USERS = '147662381';
const ACTIONID_GET_THREAD_MESSAGES = '120296731';
const ACTIONID_SEND_THREAD_MESSAGE = '115099363';
const ACTIONID_CREATE_THREAD = '120594192'; // yes, the same as SEND_DM_MESSAGE
const ACTIONID_GET_CHAT_MESSAGES = '120296718';
const ACTIONID_SEND_CHAT_MESSAGE = '120594192';
const ACTIONID_GET_AVAILABLE_ROOMS = '144362466';
const ACTIONID_SET_ROOM_MEMBERSHIP = '145360970'; // join or leave a room
const ACTIONID_WHOAMI = '115617453';
// const ACTIONID_CHAT_MEMBERS = '115617454'; // [[[115617454,[{"115617454":[["space/AAAAnDXy3Ws","AAAAnDXy3Ws",2],true]}],null,null,0]]]

const COLORS_ACTIVE_ITEM = {
  fg: 'white',
};
const COLORS_ACTIVE_SELECTED = {
  fg: 'white',
  bg: 'grey',
};
const COLORS_INACTIVE_ITEM = {
  fg: 'grey',
};
const COLORS_INACTIVE_SELECTED = {
  fg: '#111111',
  bg: 'grey',
};

module.exports = {
  URL_DATA,
  URL_MUTATE,
  URL_EVENTS,
  URL_REGISTER,
  DEFAULT_HEADERS,
  ACTIONID_GET_CHATS,
  ACTIONID_GET_CHAT_MESSAGES,
  ACTIONID_GET_CHAT_THREADS,
  ACTIONID_GET_THREAD_MESSAGES,
  ACTIONID_GET_USERS,
  ACTIONID_SEND_CHAT_MESSAGE,
  ACTIONID_SEND_THREAD_MESSAGE,
  ACTIONID_CREATE_THREAD,
  ACTIONID_GET_AVAILABLE_ROOMS,
  ACTIONID_SET_ROOM_MEMBERSHIP,
  ACTIONID_WHOAMI,
  COLORS_ACTIVE_ITEM,
  COLORS_ACTIVE_SELECTED,
  COLORS_INACTIVE_ITEM,
  COLORS_INACTIVE_SELECTED,
};
