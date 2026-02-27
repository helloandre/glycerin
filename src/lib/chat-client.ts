/**
 * Wrapper around google-chat-api GoogleChatClient
 * Provides a simplified, Glycerin-specific API
 */

import {
  GoogleChatClient,
  loadCachedCookies,
  saveCachedCookies,
} from '../../vendor/google-chat-api/index.js';
import * as utils from '../../vendor/google-chat-api/utils/index.js';
import type { Message, Space } from '../types/index.js';

export class GlycerinChatClient {
  private client: GoogleChatClient | null = null;
  private cacheDir: string;
  private eventSession: any = null;

  constructor(cacheDir = '~/.glycerin') {
    this.cacheDir = cacheDir;
  }

  /**
   * Initialize the client with cached cookies or provided cookies
   */
  async init(cookies?: Record<string, string>): Promise<void> {
    if (!cookies) {
      // Try to load from cache
      cookies = loadCachedCookies(this.cacheDir);
    }

    if (!cookies || Object.keys(cookies).length === 0) {
      throw new Error(
        'No cookies provided or found in cache. Please authenticate first.'
      );
    }

    this.client = new GoogleChatClient(cookies, this.cacheDir);
    await this.client.authenticate();
  }

  /**
   * Check if client is initialized
   */
  isInitialized(): boolean {
    return this.client !== null;
  }

  /**
   * Get all chats (spaces and DMs)
   */
  async getChats(): Promise<Space[]> {
    this.ensureInitialized();
    return this.client!.listSpaces();
  }

  /**
   * Get all chats with unread information
   */
  async getChatsWithUnread(): Promise<any[]> {
    this.ensureInitialized();
    return this.client!.listWorldItems();
  }

  /**
   * Get threads/topics for a specific chat
   */
  async getThreads(
    chatId: string,
    options?: { pageSize?: number; since?: number; cursor?: number }
  ): Promise<any> {
    this.ensureInitialized();
    return this.client!.getThreads(chatId, {
      pageSize: options?.pageSize || 50,
      format: 'threaded',
      since: options?.since,
      cursor: options?.cursor,
    });
  }

  /**
   * Get messages for a specific thread
   */
  async getThreadMessages(
    chatId: string,
    threadId: string
  ): Promise<{ messages: Message[] }> {
    this.ensureInitialized();
    return this.client!.getThread(chatId, threadId);
  }

  /**
   * Get all messages for a chat (useful for DMs without threads)
   */
  async getAllMessages(
    chatId: string,
    options?: { pageSize?: number }
  ): Promise<{ messages: Message[] }> {
    this.ensureInitialized();
    const result = await this.client!.getThreads(chatId, {
      pageSize: options?.pageSize || 50,
      format: 'messages',
    });
    return { messages: result.messages };
  }

  /**
   * Send a message to a chat (creates new thread or sends to DM)
   */
  async sendMessage(chatId: string, text: string): Promise<any> {
    this.ensureInitialized();
    return this.client!.sendMessage(chatId, text);
  }

  /**
   * Reply to a specific thread
   */
  async replyToThread(
    chatId: string,
    threadId: string,
    text: string
  ): Promise<any> {
    this.ensureInitialized();
    return this.client!.replyToThread(chatId, threadId, text);
  }

  /**
   * Mark a chat or thread as read
   */
  async markAsRead(chatId: string, threadId?: number): Promise<void> {
    this.ensureInitialized();
    if (threadId) {
      await this.client!.markAsRead(chatId, threadId);
    } else {
      await this.client!.markAsRead(chatId);
    }
  }

  /**
   * Search for chats/spaces
   */
  async findSpaces(query: string): Promise<Space[]> {
    this.ensureInitialized();
    return this.client!.findSpaces(query);
  }

  /**
   * Search all spaces for messages
   */
  async searchAllSpaces(query: string): Promise<any> {
    this.ensureInitialized();
    return this.client!.searchAllSpaces(query);
  }

  /**
   * Get current user info
   */
  async getSelfUser(): Promise<any> {
    this.ensureInitialized();
    return this.client!.getSelfUser();
  }

  /**
   * Start listening to real-time events
   */
  async startEvents(
    onEvent: (event: any) => void,
    options?: { pingIntervalSec?: number }
  ): Promise<void> {
    this.ensureInitialized();

    this.eventSession = await utils.startStayOnline(this.client!, {
      subscribe: true,
      pingIntervalSec: options?.pingIntervalSec || 60,
      onEvent: (evt: any) => {
        onEvent(evt);
      },
    });
  }

  /**
   * Stop listening to events
   */
  stopEvents(): void {
    if (this.eventSession) {
      this.eventSession.stop();
      this.eventSession = null;
    }
  }

  /**
   * Save cookies to cache
   */
  saveCookies(cookies: Record<string, string>): void {
    saveCachedCookies(cookies, this.cacheDir);
  }

  /**
   * Internal helper to ensure client is initialized
   */
  private ensureInitialized(): void {
    if (!this.client) {
      throw new Error('Client not initialized. Call init() first.');
    }
  }
}

// Singleton instance
let instance: GlycerinChatClient | null = null;

export function getChatClient(cacheDir?: string): GlycerinChatClient {
  if (!instance) {
    instance = new GlycerinChatClient(cacheDir);
  }
  return instance;
}
