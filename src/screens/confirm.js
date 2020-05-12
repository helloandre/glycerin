const blessed = require('neo-blessed');

const confirm = blessed.question({
  top: 'center',
  left: 'center',
  border: {
    type: 'line',
  },
  height: '50%',
  width: '50%',
  shadow: true,
  align: 'center',
  valign: 'center',
});

function ask(question) {
  confirm.show();
  return new Promise(res => {
    confirm.ask(`${question} [Yn]`, (err, ans) => {
      confirm.hide();
      confirm.screen.render();

      res(ans);
    });
  });
}

module.exports = {
  confirm,
  ask,
};
