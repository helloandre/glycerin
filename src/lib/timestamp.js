const moment = require('moment');

/**
 * @param {Integer} [adjust] default: 0 - adjustment to the timestamp
 *
 * @return {String}
 */
function get(adjust = 0) {
  return (Date.now() + adjust).toString() + '000';
}

/**
 * convert an api response 16-character- or integer-timestamp
 * to Moment to make it easier to format
 *
 * @param {String|Integer} ts
 *
 * @return {Moment}
 */
function from(ts) {
  return typeof ts === 'string'
    ? moment(parseInt(ts.substring(0, 13), 10))
    : moment(ts);
}

module.exports = {
  get,
  from,
};
