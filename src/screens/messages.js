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
    formatted.splice(1, 0, `  {bold}{underline}... ${str} ...{/}`);
  }

  messages.setContent(formatted.join('\n'));
  messages.setScrollPerc(100);
  messages.screen.render();
}

EE.on('threads.preview', async thread => {
  messages.setContent('Loading...');
  messages.screen.render();

  messages._data.chat = thread;
  // initially we only want to display the "preview" version of the thread
  // we expand it later by listenting for the 'messages.expand' event
  messages._data.messages = thread.messages;
  EE.emit('messages.read', thread);

  display();
});
EE.on('chats.select', async chat => {
  if (chat.isDm) {
    messages.setContent('Loading...');
    messages._data.chat = chat;
    messages._data.messages = await Chat.messages(chat);
    display();
    EE.emit('messages.read', chat);
  }
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
    display(true);
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
    messages._data.messages = await Chat.messages(messages._data.chat);
    EE.emit('messages.read', messages._data.chat);
    display();
  }
});

module.exports = {
  messages,
};
