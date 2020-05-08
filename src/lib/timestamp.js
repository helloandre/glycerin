const moment = require('moment');

/**
 * @param {Integer} [adjust] default: 0 - adjustment to the timestamp
 *
 * @return {String}
 */
function now(adjust = 0) {
  return (Date.now() + adjust).toString() + '000';
}

/**
 * get a timestamp usable for fetching "more" of a thing
 * based on the original most recent timestamp
 * i.e. parse a string, subtract 1, .toString()
 *
 * @param {String} orig
 */
function more(orig) {
  return (parseInt(orig, 10) - 1).toString();
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
  now,
  from,
  more,
};
