
import { EventEmitter } from './event-emitter.js';
import { log } from './logger.js';

const CHANNEL_URL_BASE = 'https://chat.google.com/u/0/webchannel/';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const PUSH_TIMEOUT = 60000; 
const MAX_RETRIES = 5;
const RETRY_BACKOFF_BASE = 2;

class ChunkParser {
  private _buffer = '';

  *getChunks(newData: string): Generator<string> {
    this._buffer += newData;

    while (true) {
      const newlineIndex = this._buffer.indexOf('\n');
      if (newlineIndex === -1) break;

      const lengthStr = this._buffer.slice(0, newlineIndex);
      const length = parseInt(lengthStr, 10);

      if (isNaN(length)) {
        this._buffer = this._buffer.slice(1);
        continue;
      }

      const dataStart = newlineIndex + 1;
      const availableLength = this._buffer.length - dataStart;

      if (availableLength < length) {
        break;
      }

      const chunk = this._buffer.slice(dataStart, dataStart + length);
      this._buffer = this._buffer.slice(dataStart + length);

      yield chunk;
    }
  }
}

function uniqueId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const EventType = {
  UNKNOWN: 0,
  USER_ADDED_TO_GROUP: 1,
  USER_REMOVED_FROM_GROUP: 2,
  GROUP_VIEWED: 3,
  TOPIC_VIEWED: 4,
  GROUP_UPDATED: 5,
  MESSAGE_POSTED: 6,
  MESSAGE_UPDATED: 7,
  MESSAGE_DELETED: 8,
  MEMBERSHIP_CHANGED: 15,
  TOPIC_CREATED: 20,
  MESSAGE_REACTED: 24,
  USER_STATUS_UPDATED: 25,
  TYPING_STATE_CHANGED: 29,
  READ_RECEIPT_CHANGED: 36,
  GROUP_NO_OP: 38,  
} as const;

export type EventTypeValue = typeof EventType[keyof typeof EventType];

export interface GroupId {
  type: 'space' | 'dm';
  id: string;
}

export interface MessageCreator {
  id?: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
}

export interface ParsedMessage {
  id?: string;
  topic_id?: string;
  text?: string;
  timestamp?: string;
  creator?: MessageCreator;
}

export interface ChannelCustomStatus {
  statusText?: string;
  statusEmoji?: string;
  expiryTimestampUsec?: number;
}

export interface ChannelUserStatus {
  userId?: string;
  presence?: number;
  presenceLabel?: 'active' | 'inactive' | 'unknown' | 'sharing_disabled' | 'undefined';
  dndState?: number;
  dndLabel?: 'available' | 'dnd' | 'unknown';
  activeUntilUsec?: number;
  customStatus?: ChannelCustomStatus;
}

export interface ChannelEvent {
  raw: unknown;
  type: EventTypeValue | null;
  groupId: GroupId | null;
  body: {
    message?: ParsedMessage;
    typing?: { userId?: string; state?: number };
    readReceipt?: { userId?: string; readTime?: string };
    userStatus?: ChannelUserStatus;
    raw?: unknown;
  } | null;
}

export interface Conversation {
  id: string;
  type: 'space' | 'dm';
  name?: string;
}

export class GoogleChatChannel extends EventEmitter {
  private _cookieString: string;

  private _sid: string | null = null;
  private _csessionid: string | null = null;
  private _aid = 0; 
  private _ofs = 0; 
  private _rid: number;

  private _isConnected = false;
  private _shouldReconnect = true;
  private _retryCount = 0;
  private _abortController: AbortController | null = null;
  private _chunkParser: ChunkParser | null = null;

  private _subscribedGroups = new Set<string>();

  constructor(cookieString: string) {
    super();
    this._cookieString = cookieString;
    this._rid = Math.floor(Math.random() * 90000) + 10000;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  async connect(): Promise<void> {
    this._shouldReconnect = true;
    this._retryCount = 0;

    log.channel.debug('Starting connection...');

    try {
      await this._register();

      await this._listenLoop();
    } catch (err) {
      log.channel.error('Connection error:', err);
      this.emit('error', err);
      throw err;
    }
  }

  disconnect(): void {
    log.channel.debug('Disconnecting...');
    this._shouldReconnect = false;

    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }

    if (this._isConnected) {
      this._isConnected = false;
      this.emit('disconnect');
    }
  }

  async sendPing(): Promise<void> {
    if (!this._sid) {
      log.channel.warn('Cannot send ping - not connected');
      return;
    }

    log.channel.debug('Sending activity ping');

    const pingEvent = [
      null,  
      [      
        1,     
        null,  
        1,     
        null,  
        1,     
        true,  
      ]
    ];

    await this._sendStreamEvent(pingEvent);
  }

  async subscribeToGroup(groupId: string, isDm = false): Promise<void> {
    const key = `${isDm ? 'dm' : 'space'}:${groupId}`;

    if (this._subscribedGroups.has(key)) {
      console.log(`[Channel] Already subscribed to ${key}`);
      return;
    }

    console.log(`[Channel] Subscribing to ${key}`);

    const groupIdArr = isDm
      ? [null, null, [groupId]]  
      : [[groupId]];             

    const streamEventsRequest = [
      null,  
      null,  
      null,  
      null,  
      null,  
      null,  
      null,  
      [      
        [groupIdArr]  
      ]
    ];

    await this._sendStreamEvent(streamEventsRequest);
    this._subscribedGroups.add(key);
  }

  async subscribeToAll(conversations: Conversation[]): Promise<void> {
    console.log(`[Channel] Subscribing to ${conversations.length} conversations...`);

    const groupIds = conversations.map(c => {
      const isDm = c.type === 'dm';
      return isDm
        ? [null, null, [c.id]]  
        : [[c.id]];             
    });

    const streamEventsRequest = [
      null,  
      null,  
      null,  
      null,  
      null,  
      null,  
      null,  
      [      
        groupIds  
      ]
    ];

    await this._sendStreamEvent(streamEventsRequest);

    for (const c of conversations) {
      const key = `${c.type}:${c.id}`;
      this._subscribedGroups.add(key);
    }

    console.log(`[Channel] Subscribed to ${conversations.length} conversations`);
  }

  private async _register(): Promise<void> {
    log.channel.debug('Registering...');

    this._sid = null;
    this._aid = 0;
    this._ofs = 0;

    const response = await fetch(CHANNEL_URL_BASE + 'register?ignore_compass_cookie=1', {
      method: 'GET',
      headers: {
        'Cookie': this._cookieString,
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/x-protobuf',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Register failed (${response.status}): ${text}`);
    }

    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const compassMatch = setCookie.match(/COMPASS=dynamite-ui=([^;]+)/);
      if (compassMatch) {
        this._csessionid = compassMatch[1];
        log.channel.debug('Got csessionid');
      }
    }

    log.channel.debug('Registration complete');
  }

  private async _listenLoop(): Promise<void> {
    while (this._shouldReconnect && this._retryCount <= MAX_RETRIES) {
      if (this._retryCount > 0) {
        const backoff = Math.pow(RETRY_BACKOFF_BASE, this._retryCount) * 1000;
        console.log(`[Channel] Backing off for ${backoff}ms (retry ${this._retryCount})`);
        await new Promise(r => setTimeout(r, backoff));
      }

      this._chunkParser = new ChunkParser();

      try {
        console.log(`[Channel] Listen loop iteration, SID: ${this._sid ? 'set' : 'null'}`);
        await this._longPollRequest();
        log.channel.debug('Long-poll request completed normally, looping...');
        this._retryCount = 0;
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          log.channel.debug('Request aborted');
          break;
        }

        log.channel.error('Long-poll error:', (err as Error).message);
        this._retryCount++;

        if (this._isConnected) {
          this._isConnected = false;
          this.emit('disconnect');
        }

        if ((err as Error).message.includes('Unknown SID') || (err as Error).message.includes('400')) {
          log.channel.debug('SID invalid, re-registering...');
          try {
            await this._register();
          } catch (regErr) {
            log.channel.error('Re-registration failed:', regErr);
          }
        }
      }
    }

    if (this._retryCount > MAX_RETRIES) {
      log.channel.error('Max retries exceeded');
      this.emit('error', new Error('Max retries exceeded'));
    }
  }

  private async _longPollRequest(): Promise<void> {
    this._abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      if (this._abortController) {
        this._abortController.abort();
      }
    }, PUSH_TIMEOUT);

    try {
      if (this._sid === null) {
        log.channel.debug('Opening INITIAL request to get SID...');

        const params = new URLSearchParams({
          VER: '8',
          RID: String(this._rid),
          CVER: '22',
          '$req': 'count=1&ofs=0&req0_data=%5B%5D',  
          SID: 'null',
          zx: uniqueId(),
          t: '1',
        });
        this._rid++;

        const response = await fetch(CHANNEL_URL_BASE + 'events?' + params.toString(), {
          method: 'GET',
          headers: {
            'Cookie': this._cookieString,
            'User-Agent': USER_AGENT,
            'Referer': 'https://chat.google.com/',
          },
          signal: this._abortController.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Initial request failed (${response.status}): ${text}`);
        }

        const initialResponse = response.headers.get('X-HTTP-Initial-Response');
        let newSid: string | null = null;

        if (initialResponse) {
          log.channel.debug('Got X-HTTP-Initial-Response header');
          newSid = this._parseSidFromHeader(initialResponse);
        }

        if (!newSid) {
          const text = await response.text();
          log.channel.debug('Initial response body (first 300 chars):', text.substring(0, 300));
          newSid = this._extractSidFromBody(text);
        }

        if (newSid) {
          log.channel.debug('Got SID:', newSid.substring(0, 20) + '...');
          this._sid = newSid;
          this._aid = 0;
          this._ofs = 0;

          await this._sendSidAcknowledgment();

          await this._sendInitialPing();
        } else {
          throw new Error('Failed to get SID from initial response');
        }

      } else {
        log.channel.debug('Opening long-poll request, SID:', this._sid.substring(0, 15) + '...', 'AID:', this._aid);

        const params = new URLSearchParams({
          VER: '8',
          RID: 'rpc',
          SID: this._sid,
          AID: String(this._aid),
          CI: '0',
          TYPE: 'xmlhttp',
          zx: uniqueId(),
          t: '1',
        });

        const response = await fetch(CHANNEL_URL_BASE + 'events?' + params.toString(), {
          method: 'GET',
          headers: {
            'Cookie': this._cookieString,
            'User-Agent': USER_AGENT,
            'Referer': 'https://chat.google.com/',
          },
          signal: this._abortController.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Long-poll failed (${response.status}): ${text}`);
        }

        await this._processStreamResponse(response);
      }

    } finally {
      clearTimeout(timeoutId);
      this._abortController = null;
    }
  }

  private _parseSidFromHeader(headerValue: string): string | null {
    try {
      const data = JSON.parse(headerValue);
      if (Array.isArray(data) && data[0] && Array.isArray(data[0][1])) {
        const inner = data[0][1];
        if (inner[0] === 'c' && typeof inner[1] === 'string') {
          return inner[1];
        }
      }
      return null;
    } catch (e) {
      log.channel.error('Failed to parse SID from header:', (e as Error).message);
      return null;
    }
  }

  private async _sendSidAcknowledgment(): Promise<void> {
    log.channel.debug('Sending SID acknowledgment');

    const params = new URLSearchParams({
      VER: '8',
      RID: 'rpc',
      SID: this._sid!,
      AID: String(this._aid),
      CI: '0',
      TYPE: 'xmlhttp',
      zx: uniqueId(),
      t: '1',
    });

    const response = await fetch(CHANNEL_URL_BASE + 'events?' + params.toString(), {
      method: 'GET',
      headers: {
        'Cookie': this._cookieString,
        'User-Agent': USER_AGENT,
        'Referer': 'https://chat.google.com/',
      },
    });

    if (!response.ok) {
      log.channel.error('SID acknowledgment failed:', response.status);
    } else {
      log.channel.debug('SID acknowledgment sent');
    }
  }

  private _extractSidFromBody(text: string): string | null {
    try {
      const newlineIndex = text.indexOf('\n');
      if (newlineIndex === -1) return null;

      const jsonStr = text.slice(newlineIndex + 1);
      const data = JSON.parse(jsonStr);

      if (Array.isArray(data) && data[0] && Array.isArray(data[0][1])) {
        const inner = data[0][1];
        if (inner[0] === 'c' && typeof inner[1] === 'string') {
          return inner[1];
        }
      }
      return null;
    } catch (e) {
      log.channel.error('Failed to extract SID from body:', (e as Error).message);
      return null;
    }
  }

  private async _sendInitialPing(): Promise<void> {
    log.channel.debug('Sending initial ping');

    const pingEvent = [
      null,  
      [      
        1,     
        null,  
        1,     
        null,  
        1,     
        true,  
      ]
    ];

    await this._sendStreamEvent(pingEvent);
  }

  private async _sendStreamEvent(streamEventsRequest: unknown): Promise<void> {
    if (!this._sid) {
      log.channel.warn('Cannot send event - no SID');
      return;
    }

    const params = new URLSearchParams({
      VER: '8',
      RID: String(this._rid),
      t: '1',
      SID: this._sid,
      AID: String(this._aid),
    });
    this._rid++;

    const jsonBody = JSON.stringify(streamEventsRequest);
    log.channel.debug('Sending stream event, body preview:', jsonBody.substring(0, 200));

    const body = new URLSearchParams({
      count: '1',
      ofs: String(this._ofs),
      req0_data: jsonBody,
    });
    this._ofs++;

    const response = await fetch(CHANNEL_URL_BASE + 'events?' + params.toString(), {
      method: 'POST',
      headers: {
        'Cookie': this._cookieString,
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const responseText = await response.text();
    log.channel.debug('Send event response:', response.status, responseText.substring(0, 200));

    if (!response.ok) {
      log.channel.error('Send event failed:', responseText);
    }
  }

  private async _processStreamResponse(response: Response): Promise<void> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let totalBytesRead = 0;

    log.channel.debug('Starting to process stream response...');

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          log.channel.debug('Stream ended, total bytes read:', totalBytesRead);
          break;
        }

        totalBytesRead += value.length;
        const text = decoder.decode(value, { stream: true });
        log.channel.debug('Received', value.length, 'bytes, text preview:', text.substring(0, 100));

        for (const chunk of this._chunkParser!.getChunks(text)) {
          log.channel.debug('Got complete chunk, length:', chunk.length);
          await this._processChunk(chunk);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async _processChunk(chunk: string): Promise<void> {
    if (!this._isConnected) {
      this._isConnected = true;
      log.channel.debug('Connected');
      this.emit('connect');
    }

    try {
      const containerArray = JSON.parse(chunk);

      for (const innerArray of containerArray) {
        const [arrayId, dataArray] = innerArray;

        this._aid = arrayId;

        await this._processDataArray(dataArray);
      }
    } catch (err) {
      log.channel.error('Failed to parse chunk:', err);
    }
  }

  private async _processDataArray(dataArray: unknown): Promise<void> {
    log.channel.debug('_processDataArray called, dataArray type:', typeof dataArray, 'isArray:', Array.isArray(dataArray));

    if (!dataArray || !Array.isArray(dataArray)) {
      log.channel.debug('_processDataArray: dataArray is null/undefined or not an array, returning');
      return;
    }

    log.channel.debug('_processDataArray: Processing', dataArray.length, 'items');

    for (let i = 0; i < dataArray.length; i++) {
      const item = dataArray[i];
      log.channel.debug('_processDataArray item', i, 'type:', typeof item, 'isArray:', Array.isArray(item));

      if (item === 'noop' || item === 'close') {
        log.channel.debug('_processDataArray: Got', item);
        continue;
      }

      try {
        let eventData: unknown[];

        if (typeof item === 'object' && item !== null && 'data' in item) {
          log.channel.debug('_processDataArray: Found base64 data field, decoding...');
          const decoded = this._decodeBase64((item as { data: string }).data);
          eventData = JSON.parse(decoded);
        } else if (Array.isArray(item)) {
          log.channel.debug('_processDataArray: Found pblite array');
          eventData = item;
        } else {
          log.channel.debug('_processDataArray: Unknown item format, skipping');
          continue;
        }

        const event = this._parseEventFromPblite(eventData);

        if (event) {
          log.channel.debug('Emitting event, type:', event.type, 'groupId:', JSON.stringify(event.groupId));
          this.emit('event', event);
          this._emitTypedEvent(event);
        }
      } catch (err) {
        log.channel.error('Failed to process event:', err);
      }
    }
  }

  private _decodeBase64(data: string): string {
    return Buffer.from(data, 'base64').toString('utf-8');
  }

  private _parseEventFromPblite(pbliteData: unknown[]): ChannelEvent | null {
    try {
      log.channel.debug('_parseEventFromPblite: pbliteData length:', pbliteData.length);
      log.channel.debug('_parseEventFromPblite: pbliteData[0..2]:', JSON.stringify(pbliteData.slice(0, 3)).substring(0, 500));
      
      const eventData = pbliteData[0] as unknown[];
      
      if (!eventData || !Array.isArray(eventData)) {
        log.channel.debug('_parseEventFromPblite: No event data at index 0');
        return null;
      }

      const presentFields = eventData.map((v, i) => v !== null && v !== undefined ? i : null).filter(i => i !== null);
      log.channel.debug('_parseEventFromPblite: Event fields present:', presentFields);
      
      log.channel.debug('_parseEventFromPblite: RAW EVENT:', JSON.stringify(eventData).substring(0, 800));

      const event: ChannelEvent = {
        raw: eventData,
        type: null,
        groupId: null,
        body: null,
      };

      if (eventData[0]) {
        const groupId = eventData[0] as unknown[][];
        log.channel.debug('_parseEventFromPblite: GroupId structure:', JSON.stringify(groupId).substring(0, 200));
        const spaceId = groupId[0] as unknown[] | undefined;
        const dmId = groupId[2] as unknown[] | undefined;
        if (spaceId?.[0]) {
          event.groupId = { type: 'space', id: spaceId[0] as string };
        } else if (dmId?.[0]) {
          event.groupId = { type: 'dm', id: dmId[0] as string };
        }
      }

      event.type = eventData[2] as EventTypeValue;

      const singleBody = eventData[3] as unknown[] | undefined;
      
      const eventBodies = eventData[7] as unknown[][] | undefined;
      
      const allBodies: unknown[][] = [];
      if (singleBody) {
        allBodies.push(singleBody);
      }
      if (eventBodies) {
        allBodies.push(...eventBodies);
      }
      
      log.channel.debug('_parseEventFromPblite: Processing', allBodies.length, 'bodies');
      
      for (let i = 0; i < allBodies.length; i++) {
        const body = allBodies[i];
        const bodyEventType = body[11] as EventTypeValue | undefined;
        const bodyFields = body.map((v, idx) => v !== null && v !== undefined ? idx : null).filter(idx => idx !== null);
        console.log(`[Channel] _parseEventFromPblite: Body[${i}] event_type:`, bodyEventType, 'fields:', bodyFields);
        
        if (body[5]) {
          console.log(`[Channel] _parseEventFromPblite: Body[${i}] has message_posted!`);
          event.type = EventType.MESSAGE_POSTED;
          event.body = this._parseEventBody(EventType.MESSAGE_POSTED, body, {});
          break; 
        }
        
        if (bodyEventType === EventType.MESSAGE_POSTED) {
          console.log(`[Channel] _parseEventFromPblite: Body[${i}] is MESSAGE_POSTED`);
          event.type = EventType.MESSAGE_POSTED;
          event.body = this._parseEventBody(EventType.MESSAGE_POSTED, body, {});
          break;
        }
      }
      
      if (event.type !== EventType.MESSAGE_POSTED && allBodies.length > 0) {
        const firstBody = allBodies[0];
        const firstBodyType = firstBody[11] as EventTypeValue | undefined;
        if (firstBodyType !== undefined) {
          event.type = firstBodyType;
        }
        event.body = this._parseEventBody(event.type, firstBody, {});
      }

      log.channel.debug('_parseEventFromPblite: Final event type:', event.type, 'groupId:', JSON.stringify(event.groupId));

      return event;
    } catch (err) {
      log.channel.error('Failed to parse event from pblite:', err);
      return null;
    }
  }

  private _parseEventBody(eventType: EventTypeValue | null, body: unknown[], extraFields?: Record<string, unknown>): ChannelEvent['body'] {
    switch (eventType) {
      case EventType.MESSAGE_POSTED:
        return this._parseMessageEvent(body, extraFields);
      case EventType.TYPING_STATE_CHANGED:
        return this._parseTypingEvent(body);
      case EventType.READ_RECEIPT_CHANGED:
        return this._parseReadReceiptEvent(body);
      case EventType.USER_STATUS_UPDATED:
        return this._parseUserStatusEvent(body);
      default:
        return { raw: body };
    }
  }

  private _parseMessageEvent(body: unknown[], extraFields?: Record<string, unknown>): ChannelEvent['body'] {
    let messageEvent = body[5] as unknown[] | undefined;
    if (!messageEvent && extraFields?.['6']) {
      messageEvent = extraFields['6'] as unknown[];
      log.channel.debug('_parseMessageEvent: Found MessageEvent in extraFields');
    }
    
    if (!messageEvent) {
      log.channel.debug('_parseMessageEvent: No MessageEvent at index 5 or in extraFields');
      return { raw: body };
    }

    const message = messageEvent[0] as unknown[] | undefined;
    if (!message) {
      log.channel.debug('_parseMessageEvent: No Message in MessageEvent');
      return { raw: body };
    }

    return this._parseMessageData(message, body);
  }

  private _parseMessageData(message: unknown[], raw: unknown[]): ChannelEvent['body'] {
    log.channel.debug('_parseMessageData: Message preview:', JSON.stringify(message).substring(0, 400));
    
    const messageId = message[0] as unknown[] | undefined;
    const creator = message[1] as unknown[] | undefined;
    const creatorUserId = creator?.[0] as unknown[] | undefined;
    
    let topicId: string | undefined;
    if (Array.isArray(messageId?.[0])) {
      const parentId = messageId[0] as unknown[];
      if (Array.isArray(parentId[3]) && typeof parentId[3][1] === 'string') {
        topicId = parentId[3][1];
      }
    }
    
    return {
      message: {
        id: messageId?.[1] as string | undefined,
        topic_id: topicId,
        text: message[9] as string | undefined,  
        timestamp: message[2] as string | undefined,  
        creator: {
          id: creatorUserId?.[0] as string | undefined,
          name: creator?.[1] as string | undefined,
          avatarUrl: creator?.[2] as string | undefined,
          email: creator?.[3] as string | undefined,
        },
      },
      raw,
    };
  }

  private _parseTypingEvent(body: unknown[]): ChannelEvent['body'] {
    const typingData = (body[25] || body[0]) as unknown[] | undefined;
    return {
      typing: {
        userId: ((typingData?.[0] as unknown[] | undefined)?.[0] as unknown[] | undefined)?.[0] as string | undefined,
        state: typingData?.[1] as number | undefined,
      },
      raw: body,
    };
  }

  private _parseReadReceiptEvent(body: unknown[]): ChannelEvent['body'] {
    const receiptData = (body[32] || body[0]) as unknown[] | undefined;
    return {
      readReceipt: {
        userId: ((receiptData?.[0] as unknown[] | undefined)?.[0] as unknown[] | undefined)?.[0] as string | undefined,
        readTime: receiptData?.[1] as string | undefined,
      },
      raw: body,
    };
  }

  private _parseUserStatusEvent(body: unknown[]): ChannelEvent['body'] {
    const statusData = (body[22] || body[0]) as unknown[] | undefined;
    if (!statusData) return { userStatus: {}, raw: body };

    const unwrapFirstString = (value: unknown, maxDepth: number = 6): string | undefined => {
      let current: unknown = value;
      for (let depth = 0; depth < maxDepth; depth++) {
        if (typeof current === 'string') {
          return current;
        }
        if (Array.isArray(current) && current.length > 0) {
          current = current[0];
          continue;
        }
        break;
      }
      return undefined;
    };

    const userId = unwrapFirstString(statusData?.[0]);

    const presenceValue =
      typeof statusData[1] === 'number'
        ? statusData[1]
        : (typeof statusData[1] === 'string' && /^\d+$/.test(statusData[1]) ? parseInt(statusData[1], 10) : 0);
    const presenceLabels: Record<number, ChannelUserStatus['presenceLabel']> = {
      0: 'undefined',
      1: 'active',
      2: 'inactive',
      3: 'unknown',
      4: 'sharing_disabled',
    };

    const dndValue =
      typeof statusData[3] === 'number'
        ? statusData[3]
        : (typeof statusData[3] === 'string' && /^\d+$/.test(statusData[3]) ? parseInt(statusData[3], 10) : 0);
    const dndLabels: Record<number, ChannelUserStatus['dndLabel']> = {
      0: 'unknown',
      1: 'available',
      2: 'dnd',
    };

    let activeUntilUsec: number | undefined;
    if (typeof statusData[2] === 'number') {
      activeUntilUsec = statusData[2];
    } else if (typeof statusData[2] === 'string' && /^\d+$/.test(statusData[2])) {
      activeUntilUsec = parseInt(statusData[2], 10);
    }

    let customStatus: ChannelCustomStatus | undefined;
    if (Array.isArray(statusData[4]) && Array.isArray(statusData[4][1])) {
      const cs = statusData[4][1] as unknown[];
      customStatus = {
        statusText: typeof cs[0] === 'string' ? cs[0] : undefined,
        statusEmoji: typeof cs[1] === 'string' ? cs[1] : undefined,
        expiryTimestampUsec:
          typeof cs[2] === 'number'
            ? cs[2]
            : (typeof cs[2] === 'string' && /^\d+$/.test(cs[2]) ? parseInt(cs[2], 10) : undefined),
      };
    }

    return {
      userStatus: {
        userId,
        presence: presenceValue,
        presenceLabel: presenceLabels[presenceValue] || 'undefined',
        dndState: dndValue,
        dndLabel: dndLabels[dndValue] || 'unknown',
        activeUntilUsec,
        customStatus,
      },
      raw: body,
    };
  }

  private _emitTypedEvent(event: ChannelEvent): void {
    switch (event.type) {
      case EventType.MESSAGE_POSTED:
        this.emit('message', event);
        break;
      case EventType.TYPING_STATE_CHANGED:
        this.emit('typing', event);
        break;
      case EventType.READ_RECEIPT_CHANGED:
        this.emit('readReceipt', event);
        break;
      case EventType.USER_STATUS_UPDATED:
        this.emit('userStatus', event);
        break;
      case EventType.MEMBERSHIP_CHANGED:
        this.emit('membershipChanged', event);
        break;
      case EventType.GROUP_UPDATED:
        this.emit('groupUpdated', event);
        break;
      case EventType.MESSAGE_REACTED:
        this.emit('reaction', event);
        break;
      case EventType.TOPIC_CREATED:
      case EventType.GROUP_NO_OP:
        this.emit('groupChanged', event);
        break;
    }
  }
}

export default GoogleChatChannel;
