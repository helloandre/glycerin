# Glycerin

## A Google Chat Terminal User Interface

## This is a WIP. Maybe don't use this for your daily driver chat app.

# Usage

- install: `yarn bootstrap` [^1]
- run: `yarn start`
- watch events go by: `yarn ev`

## Working

- View Rooms, DMs
- Send messages
- Unread callouts
- manually refresh rooms/threads/messages with `C-r`

## Almost working

- Event subscription (`api.js#events` and `unpack/events.js`)
- Room/DM search for exsting chats (`screens/search.js`)
- Create thread in a room (`api.js#newThread`)

## Missing

- Fetch more threads/messages
- User/Room search for new/non-joined (unknown)
- Mark As Read when joining a room/dm (probably either `/log` or `/events` endpoints)

# UNKNOWN

- what the `at` (`src/lib/api/request.js`) in the request is/does. it's part some kind of hash, some kind of timestamp. it seems to affect what messages are returned, but can't see if there's a timeout to it, and the two parts need to be generated/used togther as updating the timestamp causes request failures.

## New Features I'd Like To Add

- "quick preview" of threads to display as you're selecting them
- C-u to jump to latest unread across all chats
- C-escape to mark all chats read
- C-tab to switch between MRU chats
- basic configuration customization
- upgrade/improved rendering for neo-blessed. it's honestly kind crap.

# How It Works

- auth, grab cookies (`src/lib/api/auth.js#init`)
- register to listen to events (`src/lib/api/events.js`)
- bootstrap screen (`index.js`, `src/screen.js`)
- fetch all chats (`index.js`, `src/lib/model/chats.js#getAll`, `src/lib/api/get-chats.js`)
- when chat selected either:
  - (`isDm`) fetch chat messages (`src/screens/messages.js`, `src/lib/api/get-chat-messages.js`)
  - (`!isDm`) fetch chat threads (`src/screens/threads.js`, `src/lib/api/get-chat-threads.js`)
- listen for user input (`src/screens/input.js`)

users are fetched/cached in `lib/model/user.js`

[^1]: we can't use chrome because https://support.google.com/accounts/thread/22873505?msgid=24501976
