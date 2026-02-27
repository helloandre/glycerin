import { GoogleChatChannel, type ChannelEvent, type Conversation } from '../core/channel.js';
import type { GoogleChatClient } from '../core/client.js';

export type StayOnlineEvent =
  | { type: 'connect'; timestamp: string }
  | { type: 'disconnect'; timestamp: string }
  | { type: 'subscribed'; timestamp: string; conversations: number }
  | { type: 'ping'; timestamp: string; count: number }
  | { type: 'error'; timestamp: string; error: Error }
  | { type: 'message'; timestamp: string; event: ChannelEvent }
  | { type: 'typing'; timestamp: string; event: ChannelEvent };

export interface StayOnlineOptions {
  pingIntervalSec?: number;
  presenceTimeoutSec?: number;
  subscribe?: boolean;
  conversations?: Conversation[];
  fetchConversations?: boolean;
  createChannel?: (cookieString: string) => GoogleChatChannel;
  onEvent?: (evt: StayOnlineEvent) => void;
}

export interface StayOnlineSession {
  channel: GoogleChatChannel;
  stop: () => void;
  done: Promise<void>;
}

export async function startStayOnline(
  client: GoogleChatClient,
  options: StayOnlineOptions = {}
): Promise<StayOnlineSession> {
  const {
    pingIntervalSec = 60,
    presenceTimeoutSec = 120,
    subscribe = false,
    fetchConversations = true,
    createChannel = (cookieString: string) => new GoogleChatChannel(cookieString),
    onEvent,
  } = options;

  await client.authenticate();
  const cookieString = client.getCookieString();

  let conversations: Conversation[] = options.conversations || [];
  if (subscribe && conversations.length === 0 && fetchConversations) {
    const spaces = await client.listSpaces();
    conversations = spaces.map((s) => ({
      id: s.id,
      type: (s.type || 'space') as 'space' | 'dm',
      name: s.name,
    }));
  }

  const channel = createChannel(cookieString);
  let pingCount = 0;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let isStopping = false;

  const emit = (evt: StayOnlineEvent) => onEvent?.(evt);

  const stop = () => {
    if (isStopping) return;
    isStopping = true;
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    channel.disconnect();
  };

  channel.on('connect', async () => {
    const timestamp = new Date().toISOString();
    emit({ type: 'connect', timestamp });

    if (subscribe && conversations.length > 0) {
      try {
        await channel.subscribeToAll(conversations);
        emit({ type: 'subscribed', timestamp, conversations: conversations.length });
      } catch (err) {
        emit({ type: 'error', timestamp, error: err as Error });
      }
    }

    try {
      await channel.sendPing();
      await client.setPresenceShared(true, presenceTimeoutSec);
    } catch (err) {
      emit({ type: 'error', timestamp, error: err as Error });
    }

    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(async () => {
      const ts = new Date().toISOString();
      try {
        pingCount++;
        await channel.sendPing();
        await client.setPresenceShared(true, presenceTimeoutSec);
        emit({ type: 'ping', timestamp: ts, count: pingCount });
      } catch (err) {
        emit({ type: 'error', timestamp: ts, error: err as Error });
      }
    }, pingIntervalSec * 1000);
  });

  channel.on('disconnect', () => {
    const timestamp = new Date().toISOString();
    emit({ type: 'disconnect', timestamp });
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  });

  channel.on('error', (err) => {
    const timestamp = new Date().toISOString();
    emit({ type: 'error', timestamp, error: err as Error });
  });

  channel.on('message', (evt) => {
    const timestamp = new Date().toISOString();
    emit({ type: 'message', timestamp, event: evt as ChannelEvent });
  });

  channel.on('typing', (evt) => {
    const timestamp = new Date().toISOString();
    emit({ type: 'typing', timestamp, event: evt as ChannelEvent });
  });

  const done = channel.connect();
  return { channel, stop, done };
}
