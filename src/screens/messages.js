const blessed = require('neo-blessed');
const format = require('../lib/format');
const Chat = require('../lib/model/chat');
const EE = require('../lib/eventemitter');

const messages = blessed.box({
  label: 'Messages',
  left: '25%',
  top: '25%',
  height: '65%',
  width: '75%',
  tags: true,
  border: {
    type: 'line',
  },
  content: 'Select A Thread',
  scrollable: true,
  scrollbar: {
    style: {
      fg: 'black',
      bg: 'white',
    },
  },
  alwaysScroll: true,
});
messages._data = {};

async function display(loading = false) {
  const formatted = [];

  for (let msg of messages._data.messages) {
    formatted.push(await format.message(msg));
  }

  // we've got a thread, and potentially unfetched messages
  if (messages._data.chat.unfetched) {
    const str = loading
      ? 'loading'
      : `expand ${messages._data.chat.unfetched} more`;
    formatted.splice(1, 0, format.placehold(str));
  }

  messages.setContent(formatted.join('\n'));
  messages.setScrollPerc(100);
  messages.screen.render();
}

async function view(chat, showLoading = true) {
  // if this object is a unpack.chat and is not a dm
  // there's no messages for us to display, so ignore
  if (!chat.room && !chat.isDm) {
    return;
  }

  if (showLoading) {
    messages.setContent('Loading...');
    messages.screen.render();
  }

  messages._data.chat = chat;
  messages._data.messages = await Chat.messages(chat);
  display();

  Chat.markRead(chat);
}

EE.on('threads.preview', chat => {
  if (
    !messages._data.chat ||
    chat.uri !== messages._data.chat.uri ||
    chat.id !== messages._data.chat.id
  ) {
    view(chat);
  }
});
EE.on('chats.select', view);
EE.on('chats.nextUnread', view);
EE.on('threads.new', () => {
  messages._data = {};
  messages.setContent('New Thread');
  messages.screen.render();
});
EE.on('threads.blur', () => {
  messages._data = {};
  messages.setContent('Select A Thread');
  messages.screen.render();
});
EE.on('messages.expand', async () => {
  if (!messages._data.chat.isDm) {
    display(true);
    messages._data.messages = await Chat.messages(messages._data.chat, true);
    display();
  }
});
EE.on('screen.refresh', async () => {
  if (messages._data.chat) {
    messages._data.messages = await Chat.messages(messages._data.chat, true);
    display();
  }
});
EE.on('messages.scroll.down', () => {
  messages.scroll(1);
  messages.screen.render();
});
EE.on('messages.scroll.bottom', () => {
  messages.setScrollPerc(100);
  messages.screen.render();
});
EE.on('messages.scroll.up', () => {
  messages.scroll(-1);
  messages.screen.render();
});
EE.on('messages.scroll.top', () => {
  messages.scrollTo(0);
  messages.screen.render();
});
EE.on('messages.new', async ({ chat, thread }) => {
  if (!messages._data.chat) {
    return;
  }

  if (
    chat.uri === messages._data.chat.uri ||
    (thread && messages._data.chat.id === thread.id)
  ) {
    Chat.markRead(thread || chat);
    view(thread || chat, false);
  }
});

module.exports = {
  messages,
};
