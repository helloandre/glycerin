const os = require('os');
const path = require('path');
const fs = require('fs');
const loget = require('lodash.get');
const loset = require('lodash.set');

const FILENAME = '.glycerinconfig.json';
const FILE = path.join(os.homedir(), FILENAME);
let configData = undefined;

function get(path, def) {
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

  if (!path) {
    return configData;
  }

  return loget(configData, path, def);
}

function set(path, value) {
  if (!configData) {
    get();
  }

  loset(configData, path, value);

  persist();
}

function persist() {
  fs.writeFileSync(FILE, JSON.stringify(configData));
}

module.exports = {
  get,
  set,
};
