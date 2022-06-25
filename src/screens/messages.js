const blessed = require('neo-blessed');
const format = require('../lib/format');
const State = require('../lib/state');
// const Chat = require('../lib/model/chat');
const EE = require('../lib/eventemitter');

const DEFAULT_CONTENT = ' Select A Chat or Thread';

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
  content: DEFAULT_CONTENT,
  scrollable: true,
  scrollbar: {
    style: {
      fg: 'black',
      bg: 'white',
    },
  },
  alwaysScroll: true,
});

async function display() {
  const displayable = State.messages();
  if (!displayable) {
    messages.setContent(DEFAULT_CONTENT);
    messages.screen.render();
    return;
  }

  if (!displayable.messages || !displayable.messages.length) {
    if (displayable.loading) {
      messages.setContent(format.placehold('loading'));
    } else {
      messages.setContent(format.placehold('no messages, yet'));
    }
    messages.screen.render();
    return;
  }

  const formatted = [];
  for (let msg of displayable.messages) {
    formatted.push(await format.message(msg));
  }

  // we've got a thread, and potentially unfetched messages
  if (displayable.unfetched > 0) {
    const str = displayable.loading
      ? 'loading'
      : `expand ${displayable.unfetched} more`;
    formatted.splice(1, 0, format.placehold(str));
  }

  // for unthreaded rooms/DMs we want to let them know they can load more
  if (displayable.hasMore) {
    formatted.unshift(format.placehold('load more'));
  }

  messages.setContent(formatted.join('\n'));
  messages.setScrollPerc(100);
  messages.screen.render();
}
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
  if (messages.getScroll() === 0) {
    EE.emit('messages.at.top');
  }
});
EE.on('messages.scroll.top', () => {
  messages.scrollTo(0);
  messages.screen.render();
  EE.emit('messages.at.top');
});
EE.on('state.chats.loading', display);
EE.on('state.messages.updated', display);

module.exports = {
  messages,
};
