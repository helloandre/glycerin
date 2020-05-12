const blessed = require('neo-blessed');

const FGS = [
  '#000000',
  '#666666',
  '#999999',
  '#cccccc',
  '#ffffff',
  '#cccccc',
  '#999999',
  '#666666',
];

const working = blessed.box({
  bottom: 0,
  left: 0,
  height: 1,
  width: '100%',
  hidden: true,
  style: {
    fg: FGS[0],
    bg: '#333333',
  },
  content: 'working...',
});
working._ = {
  counter: 0,
};

function show() {
  working.show();

  if (working._.timer) {
    working._.counter = 0;
    clearInterval(working._.timer);
  }

  working._.timer = setInterval(function () {
    working.style.fg = FGS[working._.counter % FGS.length];
    working.screen.render();
    working._.counter++;
  }, 150);
}

function hide() {
  clearInterval(working._.timer);
  working.style.fg = FGS[0];
  working.hide();
  working.screen.render();
}

module.exports = {
  working,
  show,
  hide,
};
