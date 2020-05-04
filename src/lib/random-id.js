const crypto = require('crypto');

/**
 * AFACT this just needs to be a unique, base64-ish id
 * in testing, sending a "+" in this id causes a 500 error
 * so we generate too much data, remove things we don't care about
 * and hope we have enough data :)
 *
 * @param {Integer} size
 *
 * @return {String}
 */
module.exports = function (size) {
  return crypto
    .randomBytes(24)
    .toString('base64')
    .replace(/\+|\/|-|_/g, '')
    .substring(0, size);
};
