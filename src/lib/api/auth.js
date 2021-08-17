const pptr = require('puppeteer');
const axios = require('axios');
const qs = require('qs');
const moment = require('moment');
const parse = require('./parse');
const randomId = require('../random-id');
const { URL_EVENTS, URL_REGISTER } = require('../../../constants');
const config = require('../../lib/config');

const CONFIG_PATH = 'auth';
let AUTH = {
  request: {},
  events: {},
};

/**
 * go get the cookies needed to make any other requests
 *
 * This will break at some point in the future, sorry future self
 *
 * @return {Promise}
 */
function getRequestCookies() {
  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async res => {
    const browser = await pptr.launch({
      // this was brought back, apparently as Chrome works now...
      // https://support.google.com/accounts/thread/22873505?msgid=24501976
      // product: 'firefox',
      headless: false,
    });
    const page = await browser.newPage();
    page.on('load', async () => {
      if (/^https:\/\/mail\.google\.com\/chat/.test(page.url())) {
        await page.waitForSelector('#gtn-roster-iframe-id');
        const chatFrame = page
          .frames()
          .find(f => /^https:\/\/chat\.google\.com/.test(f.url()));

        const cookie = (await page.cookies('https://chat.google.com'))
          .map(c => [c.name, c.value].join('='))
          .join('; ');
        // this is some kind of magical one-time value tied to a timestamp
        // the first 6 characters seem to be consistent across users
        const at = await chatFrame.evaluate(() =>
          window.IJ_values.find(o => /:[0-9]{13}/.test(o))
        );

        res({ cookie, at });
        browser.close();
      }
    });
    await page.goto('https://chat.google.com');
  });
}

/**
 * go get and store any auth cookies.
 * first try to load from disk, otherwise
 * fire up a browser and ~trick~ask the user to log in
 */
async function init(opts) {
  AUTH = config.get(CONFIG_PATH);

  // we don't have any auth config saved, or it's >5 days old, or we forced it
  if (
    !AUTH ||
    opts['--auth'] ||
    moment(AUTH.fetchedAt).isBefore(moment().utc().subtract(5, 'days'))
  ) {
    AUTH = {
      request: await getRequestCookies(),
      fetchedAt: moment().utc().valueOf(),
    };
    config.set(CONFIG_PATH, {
      // jump through hoops lightly here to avoid saving `events`
      request: AUTH.request,
      fetchedAt: AUTH.fetchedAt,
    });
  }
}

async function register() {
  const eventsCookie = await axios({
    method: 'GET',
    url: URL_REGISTER,
    headers: {
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent': 'glycerin/0.0.1',
      accept: '*/*',
      cookie: AUTH.request.cookie,
    },
  })
    .then(({ headers }) => headers['set-cookie'][0].split(' ').shift())
    .catch(e => console.log(e));
  const cookie = `${eventsCookie} ${AUTH.request.cookie}`;

  const SID = await axios({
    method: 'POST',
    url: URL_EVENTS,
    headers: {
      accept: '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'content-type': 'application/x-www-form-urlencoded',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      referrer: 'https://chat.google.com/',
      referrerPolicy: 'origin',
      mode: 'cors',
      cookie,
    },
    params: {
      RID: 0,
      VER: 8,
      CVER: 22,
      t: 1,
      zx: randomId(12),
    },
    data: qs.stringify({
      /**
       * @TODO don't hardcode room
       */
      req0_data: '[null,null,null,null,null,null,[],[[[["AAAAasiGtkE"]]]]]',
      count: 0,
    }),
  })
    .then(({ data }) => parse.fromEvents(data)[0][0][1][1])
    .catch(e => console.log(e));

  return {
    cookie,
    SID,
  };
}

function requestData() {
  return AUTH.request;
}

async function eventsData(refresh = false) {
  if (refresh || !AUTH.events.cookie.length) {
    AUTH.events = await register();
    // we don't persist events cookie as we're not sure when it expires, exactly
  }

  return AUTH.events;
}

module.exports = { init, requestData, eventsData };
