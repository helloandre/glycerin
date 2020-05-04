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
const ACTIONID_GET_CHAT_THREADS = '120296718';
const ACTIONID_GET_USERS = '147662381';
const ACTIONID_GET_THREAD_MESSAGES = '120296731';
const ACTIONID_SEND_THREAD_MESSAGE = '115099363';
const ACTIONID_CREATE_THREAD = '120594192'; // yes, the same as SEND_DM_MESSAGE
const ACTIONID_GET_CHAT_MESSAGES = '120296718';
const ACTIONID_SEND_CHAT_MESSAGE = '120594192';

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
};
