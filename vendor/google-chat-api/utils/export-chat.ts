import type { GoogleChatClient } from '../core/client.js';
import type { Message, Topic } from '../core/types.js';
import { parseTimeToUsec, throwIfAborted } from './time.js';

export interface ExportChatCursors {
  sortTimeCursor?: string;
  timestampCursor?: string;
  anchorTimestamp?: string;
}

export interface ExportChatBatchOptions {
  pageSize?: number;
  since?: number | string;
  until?: number | string;
  isDm?: boolean;
  maxPages?: number;
  cursors?: ExportChatCursors;
  fullThreads?: boolean;
  threadPageSize?: number;
  signal?: AbortSignal;
}

export type ExportChatBatchResult = {
  page: number;
  topics: Topic[];
  messages: Message[];
  pagination: {
    has_more: boolean;
    next_sort_time_cursor?: string;
    next_timestamp_cursor?: string;
    anchor_timestamp?: string;
    contains_first_topic: boolean;
    contains_last_topic: boolean;
    reached_since_boundary?: boolean;
  };
  cursors: ExportChatCursors;
};

export async function* exportChatBatches(
  client: GoogleChatClient,
  groupId: string,
  options: ExportChatBatchOptions = {}
): AsyncGenerator<ExportChatBatchResult> {
  const {
    pageSize = 100,
    since,
    until,
    isDm,
    maxPages = 1000,
    fullThreads = false,
    threadPageSize = 500,
    signal,
  } = options;

  const sinceUsec = since !== undefined ? parseTimeToUsec(since) : undefined;
  const untilUsec = until !== undefined ? parseTimeToUsec(until) : undefined;
  if (since !== undefined && sinceUsec === undefined) {
    throw new Error(`Invalid 'since' value: ${String(since)}`);
  }
  if (until !== undefined && untilUsec === undefined) {
    throw new Error(`Invalid 'until' value: ${String(until)}`);
  }

  let page = 0;
  let sortTimeCursor = options.cursors?.sortTimeCursor;
  let timestampCursor = options.cursors?.timestampCursor;
  let anchorTimestamp = options.cursors?.anchorTimestamp;

  while (page < maxPages) {
    throwIfAborted(signal);
    page++;

    const result = await client.fetchTopicsWithServerPagination(groupId, {
      pageSize,
      sortTimeCursor,
      timestampCursor,
      anchorTimestamp,
      since: sinceUsec,
      until: untilUsec,
      isDm,
    });

    if (!anchorTimestamp && result.pagination.anchor_timestamp) {
      anchorTimestamp = result.pagination.anchor_timestamp;
    }

    if (fullThreads && result.topics.length > 0) {
      for (const topic of result.topics) {
        throwIfAborted(signal);
        try {
          const fullThread = await client.getThread(groupId, topic.topic_id, threadPageSize, isDm);
          if (fullThread.messages.length > topic.replies.length) {
            topic.replies = fullThread.messages;
            topic.message_count = fullThread.total_messages;
            topic.has_more_replies = false;
          }
        } catch {
        }
      }
    }

    const messages: Message[] = [];
    for (const topic of result.topics) {
      messages.push(...topic.replies);
    }

    yield {
      page,
      topics: result.topics,
      messages,
      pagination: result.pagination,
      cursors: {
        sortTimeCursor,
        timestampCursor,
        anchorTimestamp,
      },
    };

    if (!result.pagination.has_more || result.pagination.contains_first_topic || result.pagination.reached_since_boundary) {
      break;
    }

    sortTimeCursor = result.pagination.next_sort_time_cursor;
    timestampCursor = result.pagination.next_timestamp_cursor;
  }
}
