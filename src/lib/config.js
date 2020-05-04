const os = require('os');
const path = require('path');
const fs = require('fs');
const moment = require('moment');

const FILENAME = '.glycerinrc.json';
const FILE = path.join(os.homedir(), FILENAME);
let configData = undefined;

function get() {
  if (!configData) {
    try {
      configData = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch (e) {
      if (e instanceof SyntaxError) {
        console.error(`${FILE} invalid json`);
        process.exit(1);
      }

      // assume file doesn't exist, nuke it
      configData = {};
      // and write it as empty
      persist();
    }
  }

  return configData;
}

function persist() {
  fs.writeFileSync(FILE, JSON.stringify(configData));
}

function saveAuth(auth) {
  configData = {
    ...configData,
    auth: {
      ...auth,
      fetchedAt: moment().utc().valueOf(),
    },
  };

  persist();
}

module.exports = {
  get,
  saveAuth,
};
