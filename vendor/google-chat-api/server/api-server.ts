import { existsSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import path, { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient, type CreateClientOptions } from '../app/client.js';
import { GoogleChatChannel, type ChannelEvent, type Conversation } from '../core/channel.js';
import type { GoogleChatClient } from '../core/client.js';
import { log } from '../core/logger.js';
import type { Message, WorldItemSummary, UserPresenceWithProfile } from '../core/types.js';
import {
  getFavorites,
  addFavorite,
  removeFavorite,
  getHidden,
  addHidden,
  removeHidden,
  getLastViewed,
  setLastViewed,
} from '../core/favorites.js';

const SCALAR_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Google Chat API</title>
</head>
<body>
  <script id="api-reference" data-url="/openapi.json"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const PUBLIC_ROOT = path.join(PACKAGE_ROOT, 'public');

const OPENAPI_ROOT = path.join(PACKAGE_ROOT, 'openapi');

const FALLBACK_OPENAPI_SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'Google Chat API',
    version: '1.0.0',
    description: 'Fallback OpenAPI spec (openapi/openapi.json not found).',
  },
  paths: {
    '/health': { get: { summary: 'Health check', responses: { '200': { description: 'OK' } } } },
    '/api/whoami': { get: { summary: 'Current user', responses: { '200': { description: 'OK' } } } },
    '/api/spaces': { get: { summary: 'List spaces/DMs', responses: { '200': { description: 'OK' } } } },
    '/api/spaces/{spaceId}/threads': { get: { summary: 'List threads', responses: { '200': { description: 'OK' } } } },
    '/api/spaces/{spaceId}/threads/{topicId}': { get: { summary: 'Get thread', responses: { '200': { description: 'OK' } } } },
    '/api/spaces/{spaceId}/messages': { get: { summary: 'Fetch messages', responses: { '200': { description: 'OK' } } } },
    '/api/notifications': { get: { summary: 'Notifications', responses: { '200': { description: 'OK' } } } },
    '/api/unreads': { get: { summary: 'Unread counts', responses: { '200': { description: 'OK' } } } },
    '/api/presence': { get: { summary: 'Presence lookup', responses: { '200': { description: 'OK' } } } },
  },
} as const;

const FALLBACK_OPENAPI_YAML = `openapi: 3.1.0
info:
  title: Google Chat API
  version: 1.0.0
  description: Fallback OpenAPI spec (openapi/openapi.yaml not found).
paths:
  /health:
    get:
      summary: Health check
      responses:
        "200":
          description: OK
  /api/whoami:
    get:
      summary: Current user
      responses:
        "200":
          description: OK
`;

function loadOpenApiSpec(): unknown {
  try {
    return JSON.parse(readFileSync(path.join(OPENAPI_ROOT, 'openapi.json'), 'utf8')) as unknown;
  } catch {
    return FALLBACK_OPENAPI_SPEC;
  }
}

function loadOpenApiYaml(): string {
  try {
    return readFileSync(path.join(OPENAPI_ROOT, 'openapi.yaml'), 'utf8');
  } catch {
    return FALLBACK_OPENAPI_YAML;
  }
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data, null, 2));
}

function parseQuery(url: string): { path: string; query: Record<string, string> } {
  const [path, qs] = url.split('?');
  const query: Record<string, string> = {};
  if (qs) {
    for (const p of qs.split('&')) {
      const [k, v] = p.split('=');
      query[decodeURIComponent(k)] = decodeURIComponent(v || '');
    }
  }
  return { path, query };
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (!body) {
        return resolve({});
      }
      try {
        resolve(JSON.parse(body) as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    });
  });
}

class WebSocketManager {
  private clients = new Set<WebSocket>();
  private wss: WebSocketServer | null = null;

  attach(server: Server): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket) => {
      log.ws.debug('Client connected');
      this.clients.add(ws);

      const channelStatus = chatChannel?.isConnected ? 'connected' : 'connecting';
      ws.send(JSON.stringify({ type: 'connected', message: 'WebSocket connected', channelStatus }));
      ws.send(JSON.stringify({ type: 'channel_status', status: channelStatus }));

      let isAlive = true;
      ws.on('pong', () => {
        isAlive = true;
      });

      const pingInterval = setInterval(() => {
        if (!isAlive) {
          log.ws.debug('Client not responding to ping, terminating');
          clearInterval(pingInterval);
          ws.terminate();
          return;
        }
        isAlive = false;
        ws.ping();
      }, 30000); 

      ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          log.ws.debug('Received:', msg);
        } catch {
          log.ws.warn('Invalid message received');
        }
      });

      ws.on('close', () => {
        log.ws.debug('Client disconnected');
        clearInterval(pingInterval);
        this.clients.delete(ws);
      });

      ws.on('error', (err) => {
        log.ws.error('Client error:', err.message);
        clearInterval(pingInterval);
        this.clients.delete(ws);
      });
    });

    log.ws.info('WebSocket server attached to /ws');
  }

  broadcast(event: unknown): void {
    const message = JSON.stringify(event);
    const eventType = (event as { type?: string })?.type || 'unknown';
    log.ws.debug(`Broadcasting ${eventType} to ${this.clients.size} clients`);
    for (const client of this.clients) {
      if (client.readyState === 1) { 
        client.send(message);
      }
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }
}

let wsManager: WebSocketManager | null = null;
let chatChannel: GoogleChatChannel | null = null;

async function initChannel(cookieString: string, client: GoogleChatClient): Promise<void> {
  if (chatChannel) {
    log.channel.debug('Already initialized');
    return;
  }

  log.channel.info('Initializing real-time channel...');

  chatChannel = new GoogleChatChannel(cookieString);

  chatChannel.on('connect', () => {
    log.channel.info('Connected to Google Chat');
    wsManager?.broadcast({ type: 'channel_connected' });
    wsManager?.broadcast({ type: 'channel_status', status: 'connected' });
  });

  chatChannel.on('disconnect', () => {
    log.channel.warn('Disconnected from Google Chat');
    wsManager?.broadcast({ type: 'channel_disconnected' });
    wsManager?.broadcast({ type: 'channel_status', status: 'disconnected' });
  });

  chatChannel.on('message', (eventArg) => {
    const event = eventArg as ChannelEvent;
    log.channel.debug('New message:', event.groupId?.id);
    wsManager?.broadcast({
      type: 'message',
      event: {
        eventType: 'MESSAGE_POSTED',
        groupId: event.groupId,
        body: event.body,
      }
    });
  });

  chatChannel.on('typing', (eventArg) => {
    const event = eventArg as ChannelEvent;
    wsManager?.broadcast({
      type: 'typing',
      event: {
        eventType: 'TYPING_STATE_CHANGED',
        groupId: event.groupId,
        body: event.body,
      }
    });
  });

  chatChannel.on('readReceipt', (eventArg) => {
    const event = eventArg as ChannelEvent;
    wsManager?.broadcast({
      type: 'readReceipt',
      event: {
        eventType: 'READ_RECEIPT_CHANGED',
        groupId: event.groupId,
        body: event.body,
      }
    });
  });

  chatChannel.on('userStatus', (eventArg) => {
    const event = eventArg as ChannelEvent;

    wsManager?.broadcast({
      type: 'userStatus',
      event: {
        eventType: 'USER_STATUS_UPDATED',
        groupId: event.groupId,
        body: event.body,
      }
    });
  });

  chatChannel.on('groupChanged', (eventArg) => {
    const event = eventArg as ChannelEvent;
    log.channel.debug('Group changed (not broadcast):', event.groupId?.id, 'type:', event.type);
  });

  chatChannel.on('error', (errArg) => {
    const err = errArg as Error;
    log.channel.error('Error:', err.message);
    wsManager?.broadcast({ type: 'channel_error', error: err.message });
    wsManager?.broadcast({ type: 'channel_status', status: 'error', error: err.message });
  });

  chatChannel.connect().catch(err => {
    log.channel.error('Connection failed:', err.message);
    wsManager?.broadcast({ type: 'channel_error', error: err.message });
    wsManager?.broadcast({ type: 'channel_status', status: 'error', error: err.message });
  });

  try {
    const spaces = await client.listSpaces();
    const conversations: Conversation[] = spaces.map(s => ({
      id: s.id,
      type: s.type === 'dm' ? 'dm' : 'space',
      name: s.name,
    }));

    log.channel.debug('Waiting for connection... isConnected:', chatChannel?.isConnected);
    await new Promise<void>((resolve) => {
      if (chatChannel?.isConnected) {
        log.channel.debug('Already connected, proceeding immediately');
        resolve();
      } else {
        log.channel.debug('Setting up connect listener and 10s timeout');
        let resolved = false;
        const unsubscribe = chatChannel?.on('connect', () => {
          if (!resolved) {
            resolved = true;
            log.channel.debug('Connect event received');
            unsubscribe?.();
            resolve();
          }
        });
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            log.channel.warn('Timeout waiting for connection (10s)');
            resolve();
          }
        }, 10000);
      }
    });

    log.channel.debug('After wait - isConnected:', chatChannel?.isConnected, 'conversations:', conversations.length);
    if (chatChannel?.isConnected && conversations.length > 0) {
      await chatChannel.subscribeToAll(conversations);
    } else {
      log.channel.debug('Skipping subscriptions - isConnected:', chatChannel?.isConnected, 'conversations:', conversations.length);
    }
  } catch (err) {
    log.channel.error('Failed to subscribe to spaces:', (err as Error).message);
  }
}

export type StartApiServerOptions = CreateClientOptions & {
  port?: string | number;
  host?: string;
} & Record<string, unknown>;

export async function startApiServer(options: StartApiServerOptions = {}): Promise<void> {
  const port = parseInt(String(options.port ?? '3000'), 10);
  const host = options.host || 'localhost';

  log.server.info('Initializing Google Chat client...');
  const client = await createClient(options);

  const cookieString = client.getCookieString();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const { path, query } = parseQuery(req.url || '/');

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      return res.end();
    }

    try {
      if (path === '/' || path === '/ui' || path === '/index.html') {
        const indexPath = join(PUBLIC_ROOT, 'index.html');
        if (existsSync(indexPath)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(readFileSync(indexPath, 'utf8'));
        }
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('UI not found (missing public/index.html)');
      }

      if (path === '/app.js' || path === '/styles.css') {
        const filePath = join(PUBLIC_ROOT, path.slice(1));
        if (!existsSync(filePath)) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('Not found');
        }
        const contentType = path.endsWith('.js')
          ? 'application/javascript; charset=utf-8'
          : 'text/css; charset=utf-8';
        res.writeHead(200, {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
        });
        return res.end(readFileSync(filePath, 'utf8'));
      }

      if (path === '/docs') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(SCALAR_HTML);
      }

      if (path === '/endpoints') {
        return sendJson(res, 200, {
          endpoints: [
            { method: 'GET', path: '/', description: 'Chat UI' },
            { method: 'GET', path: '/docs', description: 'API documentation (Scalar)' },
            { method: 'GET', path: '/endpoints', description: 'List of endpoints (this)' },
            { method: 'GET', path: '/openapi.json', description: 'OpenAPI spec (JSON)' },
            { method: 'GET', path: '/openapi.yaml', description: 'OpenAPI spec (YAML)' },
            { method: 'GET', path: '/health', description: 'Health check' },
            { method: 'WS', path: '/ws', description: 'WebSocket for real-time updates' },
            { method: 'GET', path: '/api/whoami', description: 'Current user info' },
            { method: 'GET', path: '/api/spaces', description: 'List all spaces' },
            { method: 'GET', path: '/api/spaces/:spaceId', description: 'Get single space' },
            { method: 'GET', path: '/api/spaces/:spaceId/messages', description: 'Get messages (flat or ?format=threaded)' },
            { method: 'GET', path: '/api/spaces/:spaceId/topics', description: 'Get topics with server-side pagination' },
            { method: 'POST', path: '/api/spaces/:spaceId/messages', description: 'Send message' },
            { method: 'GET', path: '/api/dms/:dmId/messages', description: 'Get DM messages' },
            { method: 'GET', path: '/api/notifications', description: 'Get notifications' },
            { method: 'POST', path: '/api/mark-read/:groupId', description: 'Mark space/DM as read' },
            { method: 'GET', path: '/api/presence', description: 'Presence lookup' },
            { method: 'GET', path: '/api/favorites', description: 'List favorites' },
            { method: 'POST', path: '/api/favorites/:id', description: 'Add to favorites' },
            { method: 'DELETE', path: '/api/favorites/:id', description: 'Remove from favorites' },
            { method: 'GET', path: '/api/hidden', description: 'List hidden spaces' },
            { method: 'POST', path: '/api/hidden/:id', description: 'Hide a space' },
            { method: 'DELETE', path: '/api/hidden/:id', description: 'Unhide a space' },
            { method: 'GET', path: '/api/last-viewed', description: 'Get last viewed channel (UI restore)' },
            { method: 'PUT', path: '/api/last-viewed', description: 'Set last viewed channel' },
          ],
        });
      }

      if (path === '/openapi.json') {
        return sendJson(res, 200, loadOpenApiSpec());
      }
      if (path === '/openapi.yaml') {
        res.writeHead(200, { 'Content-Type': 'text/yaml; charset=utf-8' });
        return res.end(loadOpenApiYaml());
      }

      if (path === '/api/spaces') {
        const pageSize = query.pageSize ? parseInt(query.pageSize, 10) : 200;
        const cursor = query.cursor ? parseInt(query.cursor, 10) : undefined;
        const paginateMode = query.paginate === 'true' || cursor !== undefined;
        const enrich = query.enrich !== 'false';  

        if (paginateMode) {
          const result = await client.listSpacesPaginated({ pageSize, cursor, enrich });
          return sendJson(res, 200, {
            spaces: result.spaces,
            count: result.spaces.length,
            pagination: result.pagination,
          });
        } else {
          const spaces = await client.listSpacesEnriched({ pageSize, enrich });
          return sendJson(res, 200, {
            spaces,
            count: spaces.length,
          });
        }
      }

      if (path === '/api/whoami') {
        const user = await client.getSelfUser();
        return sendJson(res, 200, user);
      }

      if (path === '/api/debug/catchup') {
        const spaces = await client.catchUpUser();
        return sendJson(res, 200, { count: spaces.length, spaces });
      }

      const singleSpaceMatch = path.match(/^\/api\/spaces\/([^/]+)$/);
      if (singleSpaceMatch && req.method === 'GET') {
        const spaceId = decodeURIComponent(singleSpaceMatch[1]);
        const space = await client.getSpace(spaceId);
        if (space) {
          return sendJson(res, 200, space);
        } else {
          return sendJson(res, 404, { error: 'Space not found', spaceId });
        }
      }

      const topicsMatch = path.match(/^\/api\/spaces\/([^/]+)\/topics$/);
      if (topicsMatch && req.method === 'GET') {
        const spaceId = decodeURIComponent(topicsMatch[1]);
        const pageSize = parseInt(query.pageSize || '30', 10);
        const sortTimeCursor = query.sortTimeCursor || query.cursor || undefined;
        const timestampCursor = query.timestampCursor || undefined;
        const anchorTimestamp = query.anchorTimestamp || undefined;
        const since = query.since || undefined;
        const until = query.until || undefined;
        const fetchAll = query.all === 'true';
        const maxPages = query.maxPages ? parseInt(query.maxPages, 10) : undefined;
        const maxTopics = query.maxTopics ? parseInt(query.maxTopics, 10) : undefined;
        const maxMessages = query.maxMessages ? parseInt(query.maxMessages, 10) : undefined;

        if (fetchAll || maxPages) {
          const result = await client.getAllTopicsWithServerPagination(spaceId, {
            pageSize,
            maxPages: maxPages || 100,
            since,
            until,
            maxTopics,
            maxMessages,
          });
          return sendJson(res, 200, result);
        }

        const result = await client.fetchTopicsWithServerPagination(spaceId, {
          pageSize,
          sortTimeCursor,
          timestampCursor,
          anchorTimestamp,
          since,
          until,
        });
        return sendJson(res, 200, result);
      }

      const messagesOrThreadsMatch = path.match(/^\/api\/spaces\/([^/]+)\/(messages|threads)$/);
      if (messagesOrThreadsMatch && req.method === 'GET') {
        const spaceId = decodeURIComponent(messagesOrThreadsMatch[1]);
        const pageSize = parseInt(query.pageSize || '25', 10);
        const fetchFullThreads = query.full === 'true';
        const since = query.since || undefined;
        const until = query.until || undefined;
        const maxThreads = query.maxThreads ? parseInt(query.maxThreads, 10) : undefined;
        const maxMessages = query.maxMessages ? parseInt(query.maxMessages, 10) : undefined;
        const useServerFiltering = query.serverFilter === 'true' ? true : query.serverFilter === 'false' ? false : undefined;
        const includeHistory = query.history === 'true';

        if (query.maxPages) {
          const maxPages = parseInt(query.maxPages, 10);
          const result = await client.getAllMessages(spaceId, { 
            maxPages, 
            pageSize, 
            fetchFullThreads, 
            since, 
            until,
            maxMessages,
            maxThreads,
            useServerFiltering,
          });
          return sendJson(res, 200, result);
        }
        const cursor = query.cursor ? parseInt(query.cursor, 10) : undefined;
        const format = (query.format === 'messages' || query.format === 'threaded') ? query.format : undefined;
        const result = await client.getThreads(spaceId, { 
          pageSize, 
          cursor, 
          fetchFullThreads, 
          until, 
          since, 
          format,
          maxThreads,
          maxMessages,
          useServerFiltering,
          includeHistory,
        });
        return sendJson(res, 200, result);
      }

      const replyMatch = path.match(/^\/api\/spaces\/([^/]+)\/threads\/([^/]+)\/replies$/);
      if (replyMatch && req.method === 'POST') {
        const spaceId = decodeURIComponent(replyMatch[1]);
        const topicId = decodeURIComponent(replyMatch[2]);
        let body: Record<string, unknown>;
        try {
          body = await readJsonBody(req);
        } catch {
          return sendJson(res, 400, { success: false, error: 'Invalid JSON body' });
        }
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        if (!text) {
          return sendJson(res, 400, { success: false, error: 'Message text required' });
        }
        const result = await client.replyToThread(spaceId, topicId, text);
        return sendJson(res, result.success ? 200 : 500, result);
      }

      const threadMatch = path.match(/^\/api\/spaces\/([^/]+)\/threads\/([^/]+)$/);
      if (threadMatch && req.method === 'GET') {
        const spaceId = decodeURIComponent(threadMatch[1]);
        const topicId = decodeURIComponent(threadMatch[2]);
        const pageSize = parseInt(query.pageSize || '100', 10);
        console.log('[API] Getting single thread:', { spaceId, topicId, pageSize });
        const result = await client.getThread(spaceId, topicId, pageSize);
        console.log('[API] Thread result:', { messages: result.messages?.length, total: result.total_messages });
        return sendJson(res, 200, result);
      }

      const sendMessageMatch = path.match(/^\/api\/spaces\/([^/]+)\/messages$/);
      if (sendMessageMatch && req.method === 'POST') {
        const spaceId = decodeURIComponent(sendMessageMatch[1]);
        let body: Record<string, unknown>;
        try {
          body = await readJsonBody(req);
        } catch {
          return sendJson(res, 400, { success: false, error: 'Invalid JSON body' });
        }
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        if (!text) {
          return sendJson(res, 400, { success: false, error: 'Message text required' });
        }
        const result = await client.sendMessage(spaceId, text);
        return sendJson(res, result.success ? 200 : 500, result);
      }

      if (path === '/api/notifications') {
        const filterMentions = query.mentions === 'true';
        const filterThreads = query.threads === 'true';
        const filterSpaces = query.spaces === 'true';
        const filterDms = query.dms === 'true';
        const filterRead = query.read === 'true';
        const filterMe = query.me === 'true';
        const filterAtAll = query.atAll === 'true' || query['at-all'] === 'true';
        const filterSpace = query.space as string | undefined;
        const limitParam = parseInt(query.limit as string || '0', 10);
        const offsetParam = parseInt(query.offset as string || '0', 10);
        const parallelParam = parseInt(query.parallel as string || '5', 10);
        const messagesLimitParam = parseInt(query.messagesLimit as string || query['messages-limit'] as string || '3', 10);
        const showMessages = query.messages === 'true' || filterMe || filterAtAll;

        let { items } = await client.fetchWorldItems();

        let mentionsShortcutId: string | undefined;
        if (filterMe && !filterSpace) {
          const mentionsSpaces = await client.findSpaces('mentions');
          const mentionsShortcut = mentionsSpaces.find(s =>
            s.name?.toLowerCase().includes('mentions') ||
            s.name?.toLowerCase() === 'mentions-shortcut'
          );
          if (mentionsShortcut) {
            mentionsShortcutId = mentionsShortcut.id;
            items = items.filter(i => i.id === mentionsShortcutId);
          }
        }

        if (filterSpace) {
          items = items.filter(i => i.id === filterSpace);
        }

        if (filterMe || filterAtAll) {
          await client.getSelfUser();
        }

        const directMentions = items.filter(i => i.notificationCategory === 'direct_mention');
        const subscribedThreads = items.filter(i => i.notificationCategory === 'subscribed_thread');
        const subscribedSpaces = items.filter(i => i.notificationCategory === 'subscribed_space');
        const directMessages = items.filter(i => i.notificationCategory === 'direct_message');
        const readItems = items.filter(i => i.notificationCategory === 'none');
        const unreads = items.filter(i => i.notificationCategory !== 'none');
        const dms = items.filter(i => i.type === 'dm');

        const hasFilter = filterMentions || filterThreads || filterSpaces || filterDms || filterRead || filterMe || filterAtAll;
        let itemsToProcess: WorldItemSummary[] = [];

        if (hasFilter && !filterMe && !filterAtAll) {
          if (filterMentions) itemsToProcess = itemsToProcess.concat(directMentions);
          if (filterThreads) itemsToProcess = itemsToProcess.concat(subscribedThreads);
          if (filterSpaces) itemsToProcess = itemsToProcess.concat(subscribedSpaces);
          if (filterDms) itemsToProcess = itemsToProcess.concat(directMessages);
          if (filterRead) itemsToProcess = itemsToProcess.concat(readItems);
        } else if (filterMe || filterAtAll) {
          itemsToProcess = directMentions;
        } else {
          itemsToProcess = unreads;
        }

        const totalItems = itemsToProcess.length;
        if (offsetParam > 0) {
          itemsToProcess = itemsToProcess.slice(offsetParam);
        }
        if (limitParam > 0) {
          itemsToProcess = itemsToProcess.slice(0, limitParam);
        }

        const directMeMentions: WorldItemSummary[] = [];
        const atAllMentions: WorldItemSummary[] = [];
        const messages: Record<string, Message[]> = {};

        if (showMessages && itemsToProcess.length > 0) {
          for (let i = 0; i < itemsToProcess.length; i += parallelParam) {
            const batch = itemsToProcess.slice(i, i + parallelParam);
            const results = await Promise.allSettled(
              batch.map(async (item) => {
                const result = await client.getThreads(item.id, { pageSize: messagesLimitParam });
                return { item, result };
              })
            );

            for (const settledResult of results) {
              if (settledResult.status === 'fulfilled') {
                const { item, result } = settledResult.value;
                if (result.messages.length > 0) {
                  messages[item.id] = result.messages;

                  if (filterMe || filterAtAll) {
                    let hasDirectMe = false;
                    let hasAtAll = false;
                    for (const msg of result.messages) {
                      if (client.isDirectlyMentioned(msg)) hasDirectMe = true;
                      if (client.hasAllMention(msg)) hasAtAll = true;
                    }
                    if (hasDirectMe) directMeMentions.push(item);
                    if (hasAtAll && !hasDirectMe) atAllMentions.push(item);
                  }
                }
              }
            }
          }
        }

        return sendJson(res, 200, {
          directMentions: filterMentions || !hasFilter ? directMentions : [],
          subscribedThreads: filterThreads || !hasFilter ? subscribedThreads : [],
          subscribedSpaces: filterSpaces || !hasFilter ? subscribedSpaces : [],
          directMessages: filterDms || !hasFilter ? directMessages : [],
          readItems: filterRead ? readItems : [],
          directMeMentions: filterMe ? directMeMentions : [],
          atAllMentions: filterAtAll ? atAllMentions : [],
          unreads,
          dms,
          messages: showMessages ? messages : undefined,
          mentionsShortcutId: mentionsShortcutId || undefined,
          pagination: {
            total: totalItems,
            offset: offsetParam,
            limit: limitParam || totalItems,
            returned: itemsToProcess.length,
            hasMore: offsetParam + itemsToProcess.length < totalItems,
          },
        });
      }

      if (path === '/api/unreads') {
        const fetchMessages = query.fetchMessages !== 'false';
        const messagesPerSpace = parseInt(query.messagesPerSpace as string || query['messages-per-space'] as string || '5', 10);
        const checkParticipation = query.checkParticipation === 'true' || query['check-participation'] === 'true';
        const parallel = parseInt(query.parallel as string || '5', 10);
        const forceRefresh = query.refresh === 'true';

        const unreads = await client.getUnreadNotifications({
          fetchMessages,
          messagesPerSpace,
          checkParticipation,
          parallel,
          forceRefresh,
        });

        return sendJson(res, 200, {
          badges: unreads.badges,

          sections: {
            unreads: unreads.subscribedSpaces.filter(s => s.type === 'space'),

            mentions: unreads.mentions.map(m => ({
              id: m.spaceId,
              name: m.spaceName,
              type: 'mention',
              mentionType: m.mentionType,
              messageText: m.messageText?.slice(0, 100),
              mentionedBy: m.mentionedBy,
              timestamp: m.timestamp,
            })),

            directMentions: unreads.directMentions.map(m => ({
              id: m.spaceId,
              name: m.spaceName,
              type: 'direct_mention',
              messageText: m.messageText?.slice(0, 100),
              mentionedBy: m.mentionedBy,
              timestamp: m.timestamp,
            })),

            threads: unreads.subscribedThreads.map(t => ({
              id: t.spaceId,
              name: t.spaceName,
              type: 'thread',
              topicId: t.topicId,
              unreadCount: t.unreadCount,
              lastMessageText: t.lastMessageText?.slice(0, 100),
              isSubscribed: t.isSubscribed,
              isParticipant: t.isParticipant,
            })),

            directMessages: unreads.directMessages.map(d => ({
              id: d.spaceId,
              name: d.spaceName,
              type: 'dm',
              unreadCount: d.unreadCount,
            })),
          },

          raw: {
            mentions: unreads.mentions,
            directMentions: unreads.directMentions,
            subscribedThreads: unreads.subscribedThreads,
            subscribedSpaces: unreads.subscribedSpaces,
            directMessages: unreads.directMessages,
          },

          selfUserId: unreads.selfUserId,
        });
      }

      if (path === '/api/unreads/refresh') {
        const { items } = await client.fetchWorldItems({ forceRefresh: true });
        const unreads = items.filter(i => i.unreadCount > 0 || i.unreadReplyCount > 0);

        const dmUnreads = unreads.filter(i => i.type === 'dm');
        const spaceUnreads = unreads.filter(i => i.type === 'space');

        return sendJson(res, 200, {
          unreads,
          total: unreads.length,
          summary: {
            totalUnread: unreads.length,
            directMessages: dmUnreads.length,
            spaces: spaceUnreads.length,
            dmUnreadCount: dmUnreads.reduce((sum, d) => sum + d.unreadCount, 0),
            spaceUnreadCount: spaceUnreads.reduce((sum, s) => sum + s.unreadCount, 0),
          },
        });
      }

      const markReadMatch = path.match(/^\/api\/mark-read\/([^/]+)$/);
      if (markReadMatch && req.method === 'POST') {
        const groupId = decodeURIComponent(markReadMatch[1]);
        let body: Record<string, unknown> = {};
        try {
          body = await readJsonBody(req);
        } catch {
        }
        const unreadCount = typeof body.unreadCount === 'number' ? body.unreadCount : undefined;

        console.log(`[API] Marking ${groupId} as read (unreadCount: ${unreadCount})`);
        const result = await client.markAsRead(groupId, unreadCount);
        console.log(`[API] markAsRead result:`, JSON.stringify(result));
        return sendJson(res, result.success ? 200 : 500, result);
      }

      if (path === '/api/search' && query.q) {
        let matches;
        if (query.space) {
          matches = await client.searchInSpace(query.space, query.q);
        } else {
          matches = await client.searchAllSpaces(query.q);
        }
        return sendJson(res, 200, { matches, count: matches.length });
      }

      if (path === '/api/server-search' && query.q) {
        const searchOptions = {
          maxPages: query.maxPages ? parseInt(query.maxPages as string, 10) : 1,
          pageSize: query.pageSize ? parseInt(query.pageSize as string, 10) : 55,
          cursor: (query.cursor as string) || undefined,
          sessionId: (query.sessionId as string) || undefined,
        };

        const result = await client.search(query.q as string, searchOptions);

        return sendJson(res, 200, {
          query: query.q,
          results: result.results,
          count: result.results.length,
          pagination: result.pagination,
        });
      }

      if (path === '/api/find-spaces' && query.q) {
        const matches = await client.findSpaces(query.q);
        return sendJson(res, 200, { spaces: matches, count: matches.length });
      }

      if (path === '/api/dms') {
        const limit = parseInt(query.limit as string || '50', 10);
        const offset = parseInt(query.offset as string || '0', 10);
        const messagesPerDM = parseInt(query.messagesLimit as string || query['messages-limit'] as string || '10', 10);
        const parallel = parseInt(query.parallel as string || '5', 10);
        const unreadOnly = query.unread === 'true';
        const includeMessages = query.messages === 'true';
        const forceRefresh = query.refresh === 'true';

        const result = await client.getDMs({
          limit,
          offset,
          messagesPerDM,
          parallel,
          unreadOnly,
          includeMessages,
          forceRefresh,
        });

        return sendJson(res, 200, result);
      }

      if (path === '/api/dms/presence') {
        const dmIdsParam = query.dmIds as string;
        if (!dmIdsParam) {
          return sendJson(res, 200, { presences: [], total: 0 });
        }
        const dmIds = dmIdsParam.split(',').map(id => id.trim()).filter(id => id);
        if (dmIds.length === 0) {
          return sendJson(res, 200, { presences: [], total: 0 });
        }

        const parallelRaw = parseInt((query.parallel as string) || '5', 10);
        const parallel = Number.isFinite(parallelRaw) && parallelRaw > 0 ? parallelRaw : 5;

        const dmToUser: Map<string, string> = new Map();
        const selfUser = await client.getSelfUser();
        const selfUserId = selfUser?.userId;

        const dmIdsToProcess = Array.from(new Set(dmIds));
        for (let i = 0; i < dmIdsToProcess.length; i += parallel) {
          const batch = dmIdsToProcess.slice(i, i + parallel);
          await Promise.all(batch.map(async (dmId) => {
            try {
              const result = await client.getThreads(dmId, { pageSize: 3, isDm: true });
              for (const msg of result.messages) {
                const senderId = msg.sender_id || msg.sender;
                if (senderId && senderId !== selfUserId && /^\d+$/.test(senderId)) {
                  dmToUser.set(dmId, senderId);
                  break;
                }
              }
            } catch {
            }
          }));
        }

        const userIds = Array.from(new Set(dmToUser.values()));
        const presences: Array<UserPresenceWithProfile & { dmId: string }> = [];

        if (userIds.length > 0) {
          try {
            const result = await client.getUserPresenceWithProfile(userIds);
            for (const [dmId, userId] of dmToUser.entries()) {
              const presence = result.presences.find(p => p.userId === userId);
              if (presence) {
                presences.push({ ...presence, dmId });
              }
            }
          } catch {
          }
        }

        return sendJson(res, 200, {
          presences,
          total: presences.length,
        });
      }

      const dmInfoMatch = path.match(/^\/api\/dms\/([^/]+)$/);
      if (dmInfoMatch && !path.includes('/threads')) {
        const dmId = decodeURIComponent(dmInfoMatch[1]);
        const { dms } = await client.listDMs({ limit: 0 });
        const dm = dms.find(d => d.id === dmId);
        if (!dm) {
          return sendJson(res, 404, { error: 'DM not found' });
        }
        return sendJson(res, 200, dm);
      }

      const dmThreadsMatch = path.match(/^\/api\/dms\/([^/]+)\/(messages|threads|topics)$/);
      if (dmThreadsMatch && req.method === 'GET') {
        const dmId = decodeURIComponent(dmThreadsMatch[1]);
        const pageSize = parseInt(query.pageSize as string || '25', 10);
        const repliesPerTopic = parseInt(query.repliesPerTopic as string || '10', 10);
        const cursor = query.cursor ? parseInt(query.cursor as string, 10) : undefined;
        const until = (query.until as string) || undefined;
        const since = (query.since as string) || undefined;
        const fetchFullThreads = query.fullThreads === 'true';
        const format = (query.format === 'messages' || query.format === 'threaded') ? query.format as 'messages' | 'threaded' : undefined;
        const maxThreads = query.maxThreads ? parseInt(query.maxThreads as string, 10) : undefined;
        const maxMessages = query.maxMessages ? parseInt(query.maxMessages as string, 10) : undefined;
        const useServerFiltering = query.serverFilter === 'true' ? true : query.serverFilter === 'false' ? false : undefined;

        const result = await client.getDMThreads(dmId, {
          pageSize,
          repliesPerTopic,
          cursor,
          fetchFullThreads,
          until,
          since,
          format,
          maxThreads,
          maxMessages,
          useServerFiltering,
        });

        return sendJson(res, 200, {
          ...result,
          dmId,
        });
      }

      const dmSingleThreadMatch = path.match(/^\/api\/dms\/([^/]+)\/threads\/([^/]+)$/);
      if (dmSingleThreadMatch && req.method === 'GET') {
        const dmId = decodeURIComponent(dmSingleThreadMatch[1]);
        const topicId = decodeURIComponent(dmSingleThreadMatch[2]);
        const pageSize = parseInt(query.pageSize as string || '100', 10);
        const result = await client.getThread(dmId, topicId, pageSize, true);
        return sendJson(res, 200, result);
      }

      const dmReplyMatch = path.match(/^\/api\/dms\/([^/]+)\/threads\/([^/]+)\/replies$/);
      if (dmReplyMatch && req.method === 'POST') {
        const dmId = decodeURIComponent(dmReplyMatch[1]);
        const topicId = decodeURIComponent(dmReplyMatch[2]);
        let body: Record<string, unknown>;
        try {
          body = await readJsonBody(req);
        } catch {
          return sendJson(res, 400, { success: false, error: 'Invalid JSON body' });
        }
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        if (!text) {
          return sendJson(res, 400, { success: false, error: 'Message text required' });
        }
        const result = await client.replyToThread(dmId, topicId, text);
        return sendJson(res, result.success ? 200 : 500, result);
      }

      const dmMessagesMatch = path.match(/^\/api\/dms\/([^/]+)\/messages$/);
      if (dmMessagesMatch && req.method === 'POST') {
        const dmId = decodeURIComponent(dmMessagesMatch[1]);
        let body: Record<string, unknown>;
        try {
          body = await readJsonBody(req);
        } catch {
          return sendJson(res, 400, { success: false, error: 'Invalid JSON body' });
        }
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        if (!text) {
          return sendJson(res, 400, { success: false, error: 'Message text required' });
        }
        const result = await client.sendMessage(dmId, text);
        return sendJson(res, result.success ? 200 : 500, result);
      }

      if (path === '/api/presence') {
        const userIdsParam = query.userIds as string || '';
        if (!userIdsParam) {
          return sendJson(res, 400, { error: 'userIds parameter required (comma-separated list)' });
        }
        const userIds = userIdsParam.split(',').map(id => id.trim()).filter(id => id);
        if (userIds.length === 0) {
          return sendJson(res, 400, { error: 'At least one user ID required' });
        }
        if (userIds.length > 100) {
          return sendJson(res, 400, { error: 'Maximum 100 user IDs per request' });
        }

        if (query.debug === 'true') {
          const result = await client.getUserPresenceRaw(userIds);
          return sendJson(res, 200, result);
        }

        const includeProfile = query.include === 'profile';

        if (includeProfile) {
          const result = await client.getUserPresenceWithProfile(userIds);
          return sendJson(res, 200, result);
        } else {
          const result = await client.getUserPresence(userIds);
          return sendJson(res, 200, result);
        }
      }

      const presenceMatch = path.match(/^\/api\/presence\/([^/]+)$/);
      if (presenceMatch) {
        const userId = decodeURIComponent(presenceMatch[1]);
        const presence = await client.getSingleUserPresence(userId);
        if (!presence) {
          return sendJson(res, 404, { error: 'User presence not found' });
        }
        return sendJson(res, 200, presence);
      }

      if (path === '/api/attachment' && query.token) {
        try {
          const token = decodeURIComponent(query.token);
          const signedUrl = await client.getAttachmentUrl(token);
          if (!signedUrl) {
            return sendJson(res, 404, { error: 'Could not resolve attachment URL' });
          }

          const proxyRes = await client.proxyFetch(signedUrl);
          if (!proxyRes.ok) {
            return sendJson(res, proxyRes.status, { error: 'Failed to fetch attachment: ' + proxyRes.status });
          }

          const contentType = proxyRes.headers.get('content-type') || 'application/octet-stream';
          const buffer = await proxyRes.arrayBuffer();

          res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': buffer.byteLength.toString(),
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(Buffer.from(buffer));
          return;
        } catch (err) {
          log.api.error('Attachment error:', err);
          return sendJson(res, 500, { error: 'Failed to fetch attachment' });
        }
      }

      if (path === '/api/proxy' && query.url) {
        try {
          const targetUrl = decodeURIComponent(query.url);
          const urlObj = new URL(targetUrl);
          if (!urlObj.hostname.endsWith('google.com') && !urlObj.hostname.endsWith('googleusercontent.com') && !urlObj.hostname.endsWith('ggpht.com')) {
            return sendJson(res, 403, { error: 'Only Google domains allowed' });
          }

          const proxyRes = await client.proxyFetch(targetUrl);
          if (!proxyRes.ok) {
            return sendJson(res, proxyRes.status, { error: 'Proxy fetch failed: ' + proxyRes.status });
          }

          const contentType = proxyRes.headers.get('content-type') || 'application/octet-stream';
          const buffer = await proxyRes.arrayBuffer();

          res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': buffer.byteLength.toString(),
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(Buffer.from(buffer));
          return;
        } catch (err) {
          log.api.error('Proxy error:', err);
          return sendJson(res, 500, { error: 'Proxy fetch failed' });
        }
      }

      if (path === '/health') {
        return sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
      }

      if (path === '/api/favorites' && req.method === 'GET') {
        const favorites = getFavorites();
        return sendJson(res, 200, { favorites, count: favorites.length });
      }

      const addFavoriteMatch = path.match(/^\/api\/favorites\/([^/]+)$/);
      if (addFavoriteMatch && req.method === 'POST') {
        const id = decodeURIComponent(addFavoriteMatch[1]);
        const body = await readJsonBody(req);
        const { name, type } = body as { name?: string; type?: 'space' | 'dm' };
        if (!name || !type) {
          return sendJson(res, 400, { error: 'Missing name or type in request body' });
        }
        const favorite = addFavorite(id, name, type);
        return sendJson(res, 200, { success: true, favorite });
      }

      if (addFavoriteMatch && req.method === 'DELETE') {
        const id = decodeURIComponent(addFavoriteMatch[1]);
        const removed = removeFavorite(id);
        return sendJson(res, 200, { success: removed, id });
      }

      if ((path === '/api/last-viewed' || path === '/api/metadata/last-viewed') && req.method === 'GET') {
        const lastViewed = getLastViewed();
        return sendJson(res, 200, { lastViewed });
      }
      if ((path === '/api/last-viewed' || path === '/api/metadata/last-viewed') && req.method === 'PUT') {
        let body: Record<string, unknown>;
        try {
          body = await readJsonBody(req);
        } catch {
          return sendJson(res, 400, { success: false, error: 'Invalid JSON body' });
        }
        const channelId = typeof body.channelId === 'string' ? body.channelId.trim() : '';
        const channelType = body.channelType === 'space' || body.channelType === 'dm' ? body.channelType : null;
        if (!channelId || !channelType) {
          return sendJson(res, 400, { success: false, error: 'Missing channelId or channelType in request body' });
        }
        const lastViewed = setLastViewed(channelId, channelType);
        return sendJson(res, 200, { success: true, lastViewed });
      }

      if (path === '/api/hidden' && req.method === 'GET') {
        const hidden = getHidden();
        return sendJson(res, 200, { hidden, count: hidden.length });
      }

      const addHiddenMatch = path.match(/^\/api\/hidden\/([^/]+)$/);
      if (addHiddenMatch && req.method === 'POST') {
        const id = decodeURIComponent(addHiddenMatch[1]);
        const body = await readJsonBody(req);
        const { name, type } = body as { name?: string; type?: 'space' | 'dm' };
        if (!name || !type) {
          return sendJson(res, 400, { error: 'Missing name or type in request body' });
        }
        const hidden = addHidden(id, name, type);
        return sendJson(res, 200, { success: true, hidden });
      }

      if (addHiddenMatch && req.method === 'DELETE') {
        const id = decodeURIComponent(addHiddenMatch[1]);
        const removed = removeHidden(id);
        return sendJson(res, 200, { success: removed, id });
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      log.api.error('Request error:', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  });

  wsManager = new WebSocketManager();
  wsManager.attach(server);

  const shutdown = () => {
    log.server.info('Shutting down server...');
    chatChannel?.disconnect();
    server.close(() => {
      log.server.info('Server closed');
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 1000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGHUP', shutdown);

  const startServer = (retriesLeft = 5) => {
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && retriesLeft > 0) {
        log.server.warn(`Port ${port} busy, retrying in 500ms... (${retriesLeft} retries left)`);
        setTimeout(() => startServer(retriesLeft - 1), 500);
      } else {
        log.server.error('Server error:', err.message);
        process.exit(1);
      }
    });

    server.listen(port, host, () => {
    log.server.info(`Google Chat API Server running at http://${host}:${port}`);
    log.server.info('Endpoints:');
    log.server.info('  GET  /                               - Chat UI');
    log.server.info('  GET  /docs                           - API docs');
    log.server.info('  GET  /endpoints                      - Endpoints JSON');
    log.server.info('  WS   /ws                             - WebSocket for real-time');
    log.server.info('  GET  /api/spaces                     - List spaces');
    log.server.info('  GET  /api/whoami                     - Current user');
    log.server.info('  GET  /api/spaces/:id/messages        - Get messages');
    log.server.info('  GET  /api/spaces/:id/topics          - Get topics (paginated)');
    log.server.info('  POST /api/spaces/:id/messages        - Send message');
    log.server.info('  GET  /api/notifications              - Notifications');
    log.server.info('  GET  /api/favorites                  - List favorites');
    log.server.info('  POST /api/favorites/:id              - Add favorite');
    log.server.info('  DELETE /api/favorites/:id            - Remove favorite');
    log.server.info('  GET  /api/last-viewed                - Get last viewed channel');
    log.server.info('  PUT  /api/last-viewed                - Set last viewed channel');
    log.server.info('  GET  /api/hidden                     - List hidden');
    log.server.info('  POST /api/hidden/:id                 - Hide space');
    log.server.info('  DELETE /api/hidden/:id               - Unhide space');
    log.server.info('  GET  /health                         - Health check');
    log.server.info('Press Ctrl+C to stop');

    initChannel(cookieString, client).catch(err => {
      log.channel.error('Init error:', err.message);
    });
    });
  };

  startServer();
}

