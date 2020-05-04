const blessed = require('neo-blessed');

const search = blessed.prompt({
  top: '0',
  left: 'center',
  height: '25%',
  width: '25%',
  style: {
    fg: 'white',
  },
  shadow: true,
  border: {
    type: 'line',
    bold: true,
  },
});

module.exports = {
  search,
};
