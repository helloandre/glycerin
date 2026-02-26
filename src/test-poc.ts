/**
 * Proof of Concept test for google-chat-api wrapper
 * Run with: npx ts-node src/test-poc.ts
 */

import { GlycerinChatClient } from './lib/chat-client.js';

async function main() {
  console.log('🚀 Testing Glycerin Chat Client POC...\n');

  const client = new GlycerinChatClient('~/.glycerin');

  try {
    // Try to initialize with cached cookies
    console.log('📡 Initializing client with cached cookies...');
    await client.init();
    console.log('✅ Client initialized successfully!\n');

    // Test: Get all chats
    console.log('📋 Fetching all chats...');
    const chats = await client.getChats();
    console.log(`✅ Found ${chats.length} chats`);
    if (chats.length > 0) {
      console.log(
        `   First chat: ${chats[0].name || chats[0].id} (type: ${
          chats[0].type
        })`
      );
    }
    console.log();

    // Test: Get threads for first chat (if it's a space)
    if (chats.length > 0 && chats[0].type === 'space') {
      console.log(`🧵 Fetching threads for: ${chats[0].name}...`);
      const threads = await client.getThreads(chats[0].id);
      console.log(`✅ Found ${threads.topics?.length || 0} threads`);
      console.log();
    }

    // Test: Get messages for first chat (if it's a DM)
    if (chats.length > 0 && chats[0].type === 'dm') {
      console.log(`💬 Fetching messages for first DM...`);
      const messages = await client.getAllMessages(chats[0].id, {
        pageSize: 10,
      });
      console.log(`✅ Found ${messages.messages.length} messages`);
      console.log();
    }

    // Test: Get current user
    console.log('👤 Fetching current user info...');
    const user = await client.getSelfUser();
    console.log(`✅ Logged in as: ${user.name || user.id}`);
    console.log();

    console.log('🎉 All POC tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ POC test failed:', error.message);
    console.error('\n💡 Tip: Make sure you have valid cookies cached.');
    console.error(
      '   You may need to run the auth flow first to save cookies.'
    );
    process.exit(1);
  }
}

main();
