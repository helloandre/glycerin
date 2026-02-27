
import protobuf from 'protobufjs';

let root: protobuf.Root | null = null;

const PROTO_SCHEMA = `
syntax = "proto3";

message RequestHeader {
  int32 client_type = 2;
  int64 client_version = 3;
  string locale = 4;
  ClientFeatureCapabilities client_feature_capabilities = 5;
}

message ClientFeatureCapabilities {
  bool enable_all_features = 1;
  int32 spaces_level_for_testing = 2;
  int32 dms_level_for_testing = 3;
  int32 post_rooms_level = 4;
  int32 spam_room_invites_level = 5;
  int32 tombstone_level = 6;
  int32 rich_text_viewing_level = 7;
}

message SpaceId {
  string space_id = 1;
}

message DmId {
  string dm_id = 1;
}

enum UserType {
  HUMAN = 0;
  BOT = 1;
}

message UserId {
  string id = 1;
  UserType type = 2;
}

message MemberId {
  UserId user_id = 1;
}

message MembershipId {
  MemberId member_id = 1;
  SpaceId space_id = 2;
  GroupId group_id = 3;
}

message GroupId {
  SpaceId space_id = 1;
  DmId dm_id = 3;
}

message TopicId {
  string topic_id = 2;
  GroupId group_id = 3;
}

message MessageParentId {
  TopicId topic_id = 4;
}

message ReferenceRevision {
  int64 timestamp = 1;
}

enum WorldSectionType {
  WORLD_SECTION_TYPE_UNSPECIFIED = 0;
  STARRED_DIRECT_MESSAGE_PEOPLE = 1;
  STARRED_ROOMS = 2;
  STARRED_DIRECT_MESSAGE_BOTS = 3;
  NON_STARRED_DIRECT_MESSAGE_PEOPLE = 4;
  NON_STARRED_ROOMS = 5;
  NON_STARRED_DIRECT_MESSAGE_BOTS = 6;
  ALL_DIRECT_MESSAGE_PEOPLE = 7;
  ALL_ROOMS = 8;
  ALL_DIRECT_MESSAGE_BOTS = 9;
  INVITED_DM_PEOPLE = 10;
  SPAM_INVITED_DM_PEOPLE = 11;
  STARRED_DIRECT_MESSAGE_EVERYONE = 12;
  NON_STARRED_DIRECT_MESSAGE_EVERYONE = 13;
  ALL_DIRECT_MESSAGE_EVERYONE = 14;
  STARRED_DMS_AND_STARRED_UNNAMED_ROOMS = 15;
  NON_STARRED_DMS_AND_NON_STARRED_UNNAMED_ROOMS = 16;
}

message WorldSection {
  WorldSectionType world_section_type = 1;
}

message WorldFilter {}

message WorldSectionRequest {
  int32 page_size = 1;
  WorldSection world_section = 2;
  int64 anchor_sort_timestamp_micros = 3;
  WorldFilter world_filter = 4;
  int32 num_world_items_with_snippet = 5;
  string pagination_token = 6;
}

message PaginatedWorldRequest {
  enum FetchOptions {
    UNKNOWN = 0;
    EXCLUDE_GROUP_LITE = 1;
    FETCH_BOTS_IN_HUMAN_DM = 2;
    FETCH_SPACE_INTEGRATION_PAYLOADS = 3;
    FETCH_GROUPS_D3_POLICIES = 4;
  }

  RequestHeader request_header = 1;
  repeated WorldSectionRequest world_section_requests = 2;
  string world_consistency_token = 3;
  repeated FetchOptions fetch_options = 4;
  bool fetch_from_user_spaces = 5;
  bool receive_world_update_notifications = 6;
  bool fetch_snippets_for_unnamed_rooms = 7;
}

message ListTopicsRequest {
  RequestHeader request_header = 100;
  int32 page_size_for_topics = 2;
  int32 page_size_for_replies = 3;
  int32 page_size_for_unread_replies = 6;
  int32 page_size_for_read_replies = 7;
  GroupId group_id = 8;
  ReferenceRevision user_not_older_than = 9;
  ReferenceRevision group_not_older_than = 10;
}

message ListMessagesRequest {
  RequestHeader request_header = 100;
  MessageParentId parent_id = 1;
  int32 page_size = 2;
}

message GetGroupRequest {
  RequestHeader request_header = 100;
  GroupId group_id = 1;
}

message GetSelfUserStatusRequest {
  RequestHeader request_header = 100;
}

message GetMembersRequest {
  repeated MemberId member_ids = 1;
  repeated MembershipId membership_ids = 2;
  RequestHeader request_header = 100;
}

message MessageInfo {
  bool accept_format_annotations = 1;
}

message UserMentionMetadata {
  UserId user_id = 1;
  int32 mention_type = 3;
}

message Annotation {
  int32 type = 1;
  int32 start_index = 2;
  int32 length = 3;
  UserMentionMetadata user_mention_metadata = 5;
}

message CreateTopicRequest {
  string text_body = 2;
  repeated Annotation annotations = 3;
  string local_id = 4;
  GroupId group_id = 5;
  MessageInfo message_info = 9;
  RequestHeader request_header = 100;
}

message CreateMessageRequest {
  MessageParentId parent_id = 1;
  string text_body = 2;
  repeated Annotation annotations = 3;
  string local_id = 4;
  MessageInfo message_info = 7;
  RequestHeader request_header = 100;
}

enum Presence {
  UNDEFINED_PRESENCE = 0;
  ACTIVE = 1;
  INACTIVE = 2;
  UNKNOWN_PRESENCE = 3;
  SHARING_DISABLED = 4;
}

enum DndState {
  DND_STATE_UNKNOWN = 0;
  AVAILABLE = 1;
  DND = 2;
}

message GetUserPresenceRequest {
  RequestHeader request_header = 100;
  repeated UserId user_ids = 1;
  bool include_active_until = 2;
  bool include_user_status = 3;
}

message SetFocusRequest {
  RequestHeader request_header = 100;
  int32 focus_state = 1;
  int32 timeout_seconds = 2;
}

message SetActiveClientRequest {
  RequestHeader request_header = 100;
  bool is_active = 1;
  string full_jid = 2;
  int32 timeout_seconds = 3;
}

message SetPresenceSharedRequest {
  RequestHeader request_header = 100;
  bool presence_shared = 1;
  int32 timeout_seconds = 2;
}

message MarkGroupReadstateRequest {
  RequestHeader request_header = 100;
  GroupId id = 1;
  int64 last_read_time = 2;
}

message CatchUpUserRequest {
  RequestHeader request_header = 100;
  int64 last_full_sync_timestamp = 1;
  int64 last_incremental_sync_timestamp = 2;
  bool get_all_world = 3;
  bool include_conversations = 4;
}

// CatchUpRange for time-based filtering (timestamps in microseconds)
// from_revision_timestamp = "since" filter (lower bound)
// to_revision_timestamp = "until" filter (upper bound)
message CatchUpRange {
  int64 from_revision_timestamp = 1;
  int64 to_revision_timestamp = 2;
}

// CatchUpGroupRequest for fetching events with time range filtering
// Based on googlechat_conversation.c:491-533
message CatchUpGroupRequest {
  RequestHeader request_header = 100;
  GroupId group_id = 1;
  CatchUpRange range = 2;
  int32 page_size = 3;
  int32 cutoff_size = 4;
}
`;

export function loadProto(): protobuf.Root {
  if (root) return root;
  root = protobuf.parse(PROTO_SCHEMA).root;
  return root;
}

export function createRequestHeader(): {
  clientType: number;
  locale: string;
  clientVersion: number;
  clientFeatureCapabilities: { spamRoomInvitesLevel: number };
} {
  return {
    clientType: 3,  
    locale: 'en',
    clientVersion: 2440378181258,
    clientFeatureCapabilities: {
      spamRoomInvitesLevel: 2,  
    },
  };
}

export enum WorldSectionType {
  WORLD_SECTION_TYPE_UNSPECIFIED = 0,
  STARRED_DIRECT_MESSAGE_PEOPLE = 1,
  STARRED_ROOMS = 2,
  STARRED_DIRECT_MESSAGE_BOTS = 3,
  NON_STARRED_DIRECT_MESSAGE_PEOPLE = 4,
  NON_STARRED_ROOMS = 5,
  NON_STARRED_DIRECT_MESSAGE_BOTS = 6,
  ALL_DIRECT_MESSAGE_PEOPLE = 7,
  ALL_ROOMS = 8,
  ALL_DIRECT_MESSAGE_BOTS = 9,
  INVITED_DM_PEOPLE = 10,
  SPAM_INVITED_DM_PEOPLE = 11,
  STARRED_DIRECT_MESSAGE_EVERYONE = 12,
  NON_STARRED_DIRECT_MESSAGE_EVERYONE = 13,
  ALL_DIRECT_MESSAGE_EVERYONE = 14,
  STARRED_DMS_AND_STARRED_UNNAMED_ROOMS = 15,
  NON_STARRED_DMS_AND_NON_STARRED_UNNAMED_ROOMS = 16,
}

export enum UserType {
  HUMAN = 0,
  BOT = 1,
}

export enum Presence {
  UNDEFINED_PRESENCE = 0,
  ACTIVE = 1,
  INACTIVE = 2,
  UNKNOWN_PRESENCE = 3,
  SHARING_DISABLED = 4,
}

export enum DndState {
  DND_STATE_UNKNOWN = 0,
  AVAILABLE = 1,
  DND = 2,
}

export function encodePaginatedWorldRequest(pageSize = 100, cursor?: number): Uint8Array {
  const root = loadProto();
  const PaginatedWorldRequest = root.lookupType('PaginatedWorldRequest');

  const buildSectionRequest = (sectionType: WorldSectionType) => {
    const request: Record<string, unknown> = {
      pageSize: pageSize,
      worldSection: { worldSectionType: sectionType },
    };
    if (cursor !== undefined) {
      request.anchorSortTimestampMicros = cursor;
    }
    return request;
  };

  const message = PaginatedWorldRequest.create({
    requestHeader: createRequestHeader(),
    worldSectionRequests: [
      buildSectionRequest(WorldSectionType.ALL_ROOMS),
      buildSectionRequest(WorldSectionType.STARRED_ROOMS),
      buildSectionRequest(WorldSectionType.NON_STARRED_ROOMS),
      buildSectionRequest(WorldSectionType.ALL_DIRECT_MESSAGE_PEOPLE),
      buildSectionRequest(WorldSectionType.ALL_DIRECT_MESSAGE_EVERYONE),
      buildSectionRequest(WorldSectionType.STARRED_DMS_AND_STARRED_UNNAMED_ROOMS),
      buildSectionRequest(WorldSectionType.NON_STARRED_DMS_AND_NON_STARRED_UNNAMED_ROOMS),
    ],
    fetchFromUserSpaces: true,
    fetchSnippetsForUnnamedRooms: true,
  });

  return PaginatedWorldRequest.encode(message).finish();
}

export function isDmId(groupId: string): boolean {
  return !groupId.startsWith('AAAA');
}

export function encodeListTopicsRequest(
  groupId: string,
  options: {
    pageSize?: number;
    repliesPerTopic?: number;
    cursor?: number;
    isDm?: boolean;
    includeHistory?: boolean;  
  } = {}
): Uint8Array {
  const { pageSize = 25, repliesPerTopic = 50, cursor, isDm, includeHistory = false } = options;

  const isDirectMessage = isDm ?? isDmId(groupId);

  const root = loadProto();
  const ListTopicsRequest = root.lookupType('ListTopicsRequest');

  const groupIdPayload = isDirectMessage
    ? { dmId: { dmId: groupId } }      
    : { spaceId: { spaceId: groupId } }; 

  const payload: Record<string, unknown> = {
    requestHeader: createRequestHeader(),
    pageSizeForTopics: pageSize,
    pageSizeForReplies: repliesPerTopic,
    pageSizeForUnreadReplies: 50,
    pageSizeForReadReplies: 50,
    groupId: groupIdPayload,
  };

  if (cursor !== undefined) {
    payload.userNotOlderThan = { timestamp: cursor };
  }
  
  if (includeHistory) {
    payload.groupNotOlderThan = { timestamp: 0 };
    if (cursor === undefined) {
      payload.userNotOlderThan = { timestamp: 0 };
    }
  }

  const message = ListTopicsRequest.create(payload);
  return ListTopicsRequest.encode(message).finish();
}

export function encodeListMessagesRequest(
  groupId: string,
  topicId: string,
  pageSize = 100,
  isDm?: boolean
): Uint8Array {
  const isDirectMessage = isDm ?? isDmId(groupId);

  const root = loadProto();
  const ListMessagesRequest = root.lookupType('ListMessagesRequest');

  const groupIdPayload = isDirectMessage
    ? { dmId: { dmId: groupId } }      
    : { spaceId: { spaceId: groupId } }; 

  const message = ListMessagesRequest.create({
    requestHeader: createRequestHeader(),
    parentId: {
      topicId: {
        groupId: groupIdPayload,
        topicId: topicId,
      },
    },
    pageSize: pageSize,
  });

  return ListMessagesRequest.encode(message).finish();
}

export function encodeGetMembersRequest(userIds: string[]): Uint8Array {
  const root = loadProto();
  const GetMembersRequest = root.lookupType('GetMembersRequest');

  const message = GetMembersRequest.create({
    memberIds: userIds.map(userId => ({
      userId: {
        id: userId,
        type: UserType.HUMAN,
      },
    })),
    requestHeader: createRequestHeader(),
  });

  return GetMembersRequest.encode(message).finish();
}

export function encodeGetGroupRequest(spaceId: string): Uint8Array {
  const root = loadProto();
  const GetGroupRequest = root.lookupType('GetGroupRequest');

  const message = GetGroupRequest.create({
    requestHeader: createRequestHeader(),
    groupId: {
      spaceId: { spaceId: spaceId },
    },
  });

  return GetGroupRequest.encode(message).finish();
}

export function encodeGetSelfUserStatusRequest(): Uint8Array {
  const root = loadProto();
  const GetSelfUserStatusRequest = root.lookupType('GetSelfUserStatusRequest');

  const message = GetSelfUserStatusRequest.create({
    requestHeader: createRequestHeader(),
  });

  return GetSelfUserStatusRequest.encode(message).finish();
}

function generateLocalId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function encodeCreateTopicRequest(
  groupId: string,
  text: string,
  localId?: string,
  isDm?: boolean
): Uint8Array {
  const isDirectMessage = isDm ?? isDmId(groupId);

  const root = loadProto();
  const CreateTopicRequest = root.lookupType('CreateTopicRequest');

  const groupIdPayload = isDirectMessage
    ? { dmId: { dmId: groupId } }      
    : { spaceId: { spaceId: groupId } }; 

  const message = CreateTopicRequest.create({
    requestHeader: createRequestHeader(),
    textBody: text,
    localId: localId || generateLocalId(),
    groupId: groupIdPayload,
    messageInfo: {
      acceptFormatAnnotations: true,
    },
  });

  return CreateTopicRequest.encode(message).finish();
}

export function encodeCreateMessageRequest(
  groupId: string,
  topicId: string,
  text: string,
  localId?: string,
  isDm?: boolean
): Uint8Array {
  const isDirectMessage = isDm ?? isDmId(groupId);

  const root = loadProto();
  const CreateMessageRequest = root.lookupType('CreateMessageRequest');

  const groupIdPayload = isDirectMessage
    ? { dmId: { dmId: groupId } }      
    : { spaceId: { spaceId: groupId } }; 

  const message = CreateMessageRequest.create({
    requestHeader: createRequestHeader(),
    parentId: {
      topicId: {
        groupId: groupIdPayload,
        topicId: topicId,
      },
    },
    textBody: text,
    localId: localId || generateLocalId(),
    messageInfo: {
      acceptFormatAnnotations: true,
    },
  });

  return CreateMessageRequest.encode(message).finish();
}

export function encodeGetUserPresenceRequest(
  userIds: string[],
  options: {
    includeActiveUntil?: boolean;
    includeUserStatus?: boolean;
  } = {}
): Uint8Array {
  const { includeActiveUntil = true, includeUserStatus = true } = options;

  const root = loadProto();
  const GetUserPresenceRequest = root.lookupType('GetUserPresenceRequest');

  const message = GetUserPresenceRequest.create({
    requestHeader: createRequestHeader(),
    userIds: userIds.map(id => ({
      id: id,
      type: UserType.HUMAN,
    })),
    includeActiveUntil: includeActiveUntil,
    includeUserStatus: includeUserStatus,
  });

  return GetUserPresenceRequest.encode(message).finish();
}

export function encodeSetFocusRequest(
  focusState: number = 1,
  timeoutSeconds: number = 120
): Uint8Array {
  const root = loadProto();
  const SetFocusRequest = root.lookupType('SetFocusRequest');

  const message = SetFocusRequest.create({
    requestHeader: createRequestHeader(),
    focusState: focusState,
    timeoutSeconds: timeoutSeconds,
  });

  return SetFocusRequest.encode(message).finish();
}

export function encodeSetActiveClientRequest(
  isActive: boolean = true,
  timeoutSeconds: number = 120
): Uint8Array {
  const root = loadProto();
  const SetActiveClientRequest = root.lookupType('SetActiveClientRequest');

  const message = SetActiveClientRequest.create({
    requestHeader: createRequestHeader(),
    isActive: isActive,
    timeoutSeconds: timeoutSeconds,
  });

  return SetActiveClientRequest.encode(message).finish();
}

export function encodeSetPresenceSharedRequest(
  presenceShared: boolean = true,
  timeoutSeconds: number = 300
): Uint8Array {
  const root = loadProto();
  const SetPresenceSharedRequest = root.lookupType('SetPresenceSharedRequest');

  const message = SetPresenceSharedRequest.create({
    requestHeader: createRequestHeader(),
    presenceShared: presenceShared,
    timeoutSeconds: timeoutSeconds,
  });

  return SetPresenceSharedRequest.encode(message).finish();
}

export function encodeMarkGroupReadstateRequest(
  groupId: string,
  lastReadTimeMicros?: number,
  isDm?: boolean
): Uint8Array {
  const isDirectMessage = isDm ?? isDmId(groupId);

  const timestamp = lastReadTimeMicros ?? Date.now() * 1000;

  const root = loadProto();
  const MarkGroupReadstateRequest = root.lookupType('MarkGroupReadstateRequest');

  const groupIdPayload = isDirectMessage
    ? { dmId: { dmId: groupId } }      
    : { spaceId: { spaceId: groupId } }; 

  const message = MarkGroupReadstateRequest.create({
    requestHeader: createRequestHeader(),
    id: groupIdPayload,
    lastReadTime: timestamp,
  });

  return MarkGroupReadstateRequest.encode(message).finish();
}

export function encodeCatchUpUserRequest(): Uint8Array {
  const root = loadProto();
  const CatchUpUserRequest = root.lookupType('CatchUpUserRequest');

  const message = CatchUpUserRequest.create({
    requestHeader: createRequestHeader(),
    lastFullSyncTimestamp: 0,
    lastIncrementalSyncTimestamp: 0,
    getAllWorld: true,
    includeConversations: true,
  });

  return CatchUpUserRequest.encode(message).finish();
}

export function encodeCatchUpGroupRequest(
  groupId: string,
  options: {
    sinceUsec?: number;
    untilUsec?: number;
    pageSize?: number;
    cutoffSize?: number;
    isDm?: boolean;
  } = {}
): Uint8Array {
  const { 
    sinceUsec, 
    untilUsec, 
    pageSize = 500, 
    cutoffSize = 2000,
    isDm 
  } = options;

  const isDirectMessage = isDm ?? isDmId(groupId);

  const root = loadProto();
  const CatchUpGroupRequest = root.lookupType('CatchUpGroupRequest');

  const groupIdPayload = isDirectMessage
    ? { dmId: { dmId: groupId } }      
    : { spaceId: { spaceId: groupId } }; 

  const range: Record<string, number> = {};
  if (sinceUsec !== undefined) {
    range.fromRevisionTimestamp = sinceUsec;
  }
  if (untilUsec !== undefined) {
    range.toRevisionTimestamp = untilUsec;
  }

  const payload: Record<string, unknown> = {
    requestHeader: createRequestHeader(),
    groupId: groupIdPayload,
    pageSize: pageSize,
    cutoffSize: cutoffSize,
  };

  if (Object.keys(range).length > 0) {
    payload.range = range;
  }

  const message = CatchUpGroupRequest.create(payload);
  return CatchUpGroupRequest.encode(message).finish();
}
