# Glycerin

## A Google Chat Terminal User Interface

## This is a WIP. Maybe don't use this for your daily driver chat app.

# Usage

## Install

- install: `yarn bootstrap` [^1]

## Running

- run: `yarn start`
- watch events go by: `yarn ev`

## Helpful One-offs

- Quickly leave a bunch of rooms and/or dms:
  - `yarn leave`

# Key Bindings

### Global

- `ctrl+d` - exit
- `ctrl+n` - go to the newest unread message
- `ctrl+f f` - find rooms to join
- `ctrl+f /` - find rooms/dms already joined

### Chats

- `enter` - select chat
- `j`/`k`/`up`/`down`/`g`/`shift+g` - navigate
- `e` - expand/collapse section
- `ctrl+r l` - leave room
- (todo) `ctrl+r s` - star/unstar
- (todo) `ctrl+r m` - mute/unmute
- (todo) `ctrl+r a` - add user/bot

### Threads

- `enter` - select thread
- `escape` - exit to chats
- `j`/`k`/`up`/`down`/`g`/`shift+g` - navigate
- `ctrl+t n` - new thread

### Input

- `escape` - exit to threads or chats (in case of dm)

### Messages

- `ctrl+j`/`ctrl+k`/`ctrl+g`/`ctrl+l` - navitage (todo: update ctrl+l to ctrl+shift+g)
- `ctrl+e` - expand

# Status

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
- scrolling messages
- User/Room search for new/non-joined (unknown)
- Mark As Read when joining a room/dm (probably either `/log` or `/events` endpoints)

## New Features I'd Like To Add

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
