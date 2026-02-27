/**
 * EventBridge component
 * Connects google-chat-api WebChannel events to React state updates
 */

import { useEffect } from 'react';
import { useAppState } from '../context/AppContext.js';
import type { GlycerinChatClient } from '../lib/chat-client.js';
import { logger } from '../lib/logger.js';

interface EventBridgeProps {
  client: GlycerinChatClient;
}

export function EventBridge({ client }: EventBridgeProps) {
  const { dispatch } = useAppState();

  useEffect(() => {
    // Start listening to events from google-chat-api
    const startEvents = async () => {
      try {
        await client.startEvents((event: any) => {
          // Handle different event types
          handleEvent(event);
        });
      } catch (error) {
        logger.error('Failed to start event stream', error);
      }
    };

    const handleEvent = (event: any) => {
      // Log events for debugging
      logger.debug('Event received:', event.type);

      // Map google-chat-api events to our state actions
      switch (event.type) {
        case 'message': {
          // New message received from WebChannel
          // event.event is the ChannelEvent which contains body.message
          const channelEvent = event.event;
          if (channelEvent?.body?.message) {
            const msg = channelEvent.body.message;
            const groupId = channelEvent.groupId;

            // Convert ChannelEvent message to our Message format
            const message = {
              message_id: msg.id,
              space_id: groupId?.id || '',
              topic_id: msg.topic_id || (groupId?.type === 'dm' ? 'dm' : ''),
              text: msg.text || '',
              timestamp: msg.timestamp || new Date().toISOString(),
              sender: msg.creator?.name || '',
              sender_id: msg.creator?.id || '',
              sender_email: msg.creator?.email || '',
            };

            dispatch({
              type: 'MESSAGE_RECEIVED',
              payload: message,
            });
          }
          break;
        }

        case 'thread_updated':
          // Thread was updated (new message in thread)
          // We'll need to refetch the thread
          break;

        case 'space_updated':
          // Space metadata changed
          break;

        case 'read_state':
          // Read state changed
          if (event.space_id) {
            dispatch({
              type: 'MARK_READ',
              payload: {
                chatId: event.space_id,
                threadId: event.topic_id,
              },
            });
          }
          break;

        default:
          // Unknown event type
          break;
      }
    };

    startEvents();

    // Cleanup: stop listening when component unmounts
    return () => {
      client.stopEvents();
    };
  }, [client, dispatch]);

  // This component doesn't render anything
  return null;
}
