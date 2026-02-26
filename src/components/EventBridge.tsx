/**
 * EventBridge component
 * Connects google-chat-api WebChannel events to React state updates
 */

import { useEffect } from 'react';
import { useAppState } from '../context/AppContext.js';
import type { GlycerinChatClient } from '../lib/chat-client.js';

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
        console.error('Failed to start event stream:', error);
      }
    };

    const handleEvent = (event: any) => {
      // Log events for debugging
      // console.log('Event received:', event.type, event);

      // Map google-chat-api events to our state actions
      switch (event.type) {
        case 'message':
          // New message received
          dispatch({
            type: 'MESSAGE_RECEIVED',
            payload: event.message,
          });
          break;

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
