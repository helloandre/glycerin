function fromResponse(contents) {
  // first two lines are garbage
  // we ignore all three
  // eslint-disable-next-line no-unused-vars
  const [_, rest] = readUntil(contents, '\n');
  return parse(rest.trimLeft());
}

/**
 * Events endpoing has a slightly different "structure" than data endpoint
 * so we need to treat it like the special endpoint it is
 *
 * @param {String} contents
 */
function fromEvents(contents) {
  return parse(contents, 0);
}

/**
 * Batch Events are "simpler"
 *
 * @param {String} contents
 */
function fromBatchExecute(contents) {
  // first line is garbage
  // eslint-disable-next-line no-unused-vars
  const [_, rest] = readUntil(contents, '\n');
  // yeah, nested strings of json
  return JSON.parse(rest.trimLeft())
    .filter(req => req[0] === 'wrb.fr')
    .map(req => JSON.parse(req[2]));
}

/**
 * parse a response from /data
 * structure is:
 *    <number> - length of response
 *    <response>
 *    ... other length + responses
 * @param {String} contents
 */
function parse(contents, adjust = 1) {
  let rest = contents;
  let resp;
  let nextIdx;
  const responses = [];
  while (rest.length) {
    [nextIdx, rest] = readUntil(rest, '\n');
    [resp, rest] = readUntil(rest, parseInt(nextIdx, 10) - adjust);
    responses.push(JSON.parse(resp));
  }
  return responses;
}

/**
 * reads a string until either the given index of character
 * there are probably better ways to do this
 *
 * @param {String} str
 * @param {Number|String} until
 *
 * @returns [String, String] - [desired read value, rest]
 */
function readUntil(str, until) {
  const len = typeof until === 'string' ? str.indexOf(until) + 1 : until;
  return [str.substring(0, len), str.substring(len)];
}

module.exports = {
  fromResponse,
  fromEvents,
  fromBatchExecute,
};
