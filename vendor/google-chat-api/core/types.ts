
export interface SpaceEmoji {
  unicode?: string;     
}

export interface SpaceEnrichment {
  emoji?: SpaceEmoji;
  rosterId?: string;     
}

export interface Space {
  id: string;
  name?: string;
  type: 'space' | 'dm';
  sortTimestamp?: number;  

  emoji?: SpaceEmoji;
  rosterId?: string;       
}

export interface SpacesPagination {
  hasMore: boolean;
  nextCursor?: number;
}

export interface SpacesResult {
  spaces: Space[];
  pagination: SpacesPagination;
}

export enum AnnotationType {
  UNKNOWN = 0,
  USER_MENTION = 1,
  FORMAT = 2,
  DRIVE = 3,            
  URL = 4,
  USER_MENTION_V2 = 6,  
  IMAGE = 9,            
  UPLOAD = 10,          
  MEMBERSHIP_CHANGED = 11,
  UPLOAD_METADATA = 13, 
}

export interface UserMention {
  user_id: string;
  display_name?: string;
  mention_type: 'user' | 'bot' | 'all';
}

export interface UrlMetadata {
  url: string;
  title?: string;
  image_url?: string;   
  mime_type?: string;   
}

export interface FormatMetadata {
  format_type: 'bold' | 'italic' | 'strikethrough' | 'monospace';
}

export interface ImageMetadata {
  image_url: string;
  width?: number;
  height?: number;
  alt_text?: string;
  content_type?: string;  
}

export interface AttachmentMetadata {
  attachment_id?: string;
  content_name?: string;  
  content_type?: string;  
  content_size?: number;  
  download_url?: string;
  thumbnail_url?: string;
}

export interface Annotation {
  type: AnnotationType;
  start_index: number;
  length: number;
  user_mention?: UserMention;
  url_metadata?: UrlMetadata;
  format_metadata?: FormatMetadata;
  image_metadata?: ImageMetadata;
  attachment_metadata?: AttachmentMetadata;
}

export interface CardButton {
  text: string;
  url?: string;
  tooltip?: string;
  icon_name?: string;
  icon_url?: string;
}

export interface CardWidget {
  type: 'text_paragraph' | 'decorated_text' | 'button_list';
  html?: string;
  text?: string;
  icon_name?: string;
  icon_url?: string;
  label?: string;
  value?: string;
  buttons?: CardButton[];
}

export interface CardSection {
  widgets: CardWidget[];
}

export interface Card {
  card_id?: string;
  header?: {
    title: string;
    subtitle?: string;
    image_url?: string;
  };
  sections: CardSection[];
}

export interface Message {
  message_id?: string;
  topic_id?: string;
  space_id?: string;
  text: string;
  timestamp?: string;
  timestamp_usec?: number;
  sender?: string;
  sender_id?: string;  
  sender_email?: string;
  sender_avatar_url?: string;
  is_thread_reply?: boolean;
  reply_index?: number;
  annotations?: Annotation[];
  mentions?: UserMention[];
  has_mention?: boolean;
  images?: ImageMetadata[];
  attachments?: AttachmentMetadata[];
  urls?: UrlMetadata[];
  cards?: Card[];
}

export interface SendMessageResult {
  success: boolean;
  message_id?: string;
  topic_id?: string;
  error?: string;
}

export interface SelfUser {
  userId: string;
  name?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
}

export enum PresenceStatus {
  UNDEFINED = 0,
  ACTIVE = 1,
  INACTIVE = 2,
  UNKNOWN = 3,
  SHARING_DISABLED = 4,
}

export enum DndStateStatus {
  UNKNOWN = 0,
  AVAILABLE = 1,
  DND = 2,
}

export interface CustomStatus {
  statusText?: string;
  statusEmoji?: string;
  expiryTimestampUsec?: number;
}

export interface UserPresence {
  userId: string;
  presence: PresenceStatus;
  presenceLabel: 'active' | 'inactive' | 'unknown' | 'sharing_disabled' | 'undefined';
  dndState: DndStateStatus;
  dndLabel: 'available' | 'dnd' | 'unknown';
  activeUntilUsec?: number;
  customStatus?: CustomStatus;
}

export interface UserPresenceResult {
  presences: UserPresence[];
  total: number;
}

export interface UserPresenceWithProfile extends UserPresence {
  name?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
}

export interface UserPresenceWithProfileResult {
  presences: UserPresenceWithProfile[];
  total: number;
}

export interface Topic {
  topic_id: string;
  space_id: string;
  sort_time?: number;
  message_count: number;
  has_more_replies?: boolean;  
  replies: Message[];
}

export interface PaginationInfo {
  contains_first_topic: boolean;
  contains_last_topic: boolean;
  has_more: boolean;
  next_cursor?: number;
}

export interface ThreadsResult {
  messages: Message[];
  topics: Topic[];
  pagination: PaginationInfo;
  total_topics: number;
  total_messages: number;
}

export interface ServerTopicsPaginationInfo {
  has_more: boolean;
  next_sort_time_cursor?: string;
  next_timestamp_cursor?: string;
  anchor_timestamp?: string;
  contains_first_topic: boolean;
  contains_last_topic: boolean;
  reached_since_boundary?: boolean;
}

export interface ServerTopicsResult {
  topics: Topic[];
  messages: Message[];
  pagination: ServerTopicsPaginationInfo;
  total_topics: number;
  total_messages: number;
}

export interface ThreadResult {
  messages: Message[];
  topic_id: string;
  space_id: string;
  total_messages: number;
}

export interface AllMessagesResult {
  messages: Message[];
  topics: Topic[];
  pages_loaded: number;
  has_more: boolean;
}

export interface SearchMatch extends Message {
  space_name?: string;
  snippet?: string;
}

export interface SearchMember {
  userId: string;
  name: string;
  avatarUrl?: string;
  email?: string;
  firstName?: string;
  membershipType?: number;
}

export interface SearchUserInfo {
  userId: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
}

export interface SearchSpaceResult {
  spaceId: string;           
  shortId: string;           
  type: 'space' | 'dm' | 'group_dm';
  roomType?: string;         

  name: string;
  avatarUrl?: string;
  emoji?: string;
  description?: string;

  lastActivityMs?: number;
  lastMessageTimestampUsec?: string;
  lastReadTimestampUsec?: string;
  createdTimestampMs?: number;
  createdTimestampUsec?: string;
  sortTimestampMs?: number;

  memberCount?: number;
  totalMemberCount?: number;
  members?: SearchMember[];     
  creatorInfo?: SearchUserInfo;
  lastSenderInfo?: SearchUserInfo;

  isHidden?: boolean;
  isMuted?: boolean;
  isFollowing?: boolean;
  isDiscoverable?: boolean;
  hasMessages?: boolean;
  unreadCount?: number;

  rosterId?: string;           
  orgUnit?: string;

  notificationSettings?: {
    enabled?: boolean;
    level?: number;
  };

  unreadStats?: {
    totalUnread?: number;
    mentionUnread?: number;
    threadUnread?: number;
  };
}

export interface SearchPagination {
  cursor: string | null;       
  hasMore: boolean;
  resultCount: number;
  sessionId: string;           
}

export interface SearchResponse {
  results: SearchSpaceResult[];
  pagination: SearchPagination;
}

export interface SearchOptions {
  maxPages?: number;           
  pageSize?: number;           
  cursor?: string;             
  sessionId?: string;          
}

export type NotificationCategory =
  | 'direct_mention'      
  | 'subscribed_thread'   
  | 'subscribed_space'    
  | 'direct_message'      
  | 'none';               

export interface WorldItemSummary {
  id: string;
  name?: string;
  type: 'space' | 'dm';
  unreadCount: number;
  unreadSubscribedTopicCount: number;
  lastMentionTime?: number;
  unreadReplyCount: number;
  lastMessageText?: string;
  subscribedThreadId?: string;       
  isSubscribedToSpace?: boolean;     
  notificationCategory: NotificationCategory;
}

export type MentionType = 'direct' | 'all' | 'none';

export interface UnreadMention {
  spaceId: string;
  spaceName?: string;
  topicId?: string;
  messageId?: string;
  messageText?: string;
  mentionType: MentionType;
  mentionedBy?: string;         
  mentionedByUserId?: string;
  timestamp?: number;           
  timestampFormatted?: string;  
}

export interface UnreadThread {
  spaceId: string;
  spaceName?: string;
  topicId: string;
  unreadCount: number;
  lastMessageText?: string;
  lastMessageSender?: string;
  lastMessageSenderId?: string;
  lastMessageTimestamp?: number;
  lastMessageTimestampFormatted?: string;
  isSubscribed: boolean;        
  isParticipant: boolean;       
}

export interface UnreadSpace {
  spaceId: string;
  spaceName?: string;
  type: 'space' | 'dm';
  unreadCount: number;
  unreadSubscribedTopicCount: number;
  lastMentionTime?: number;
  unreadReplyCount: number;
  lastMessageText?: string;
  lastMessageSender?: string;
  lastMessageTimestamp?: number;
  isSubscribed: boolean;
  hasMention: boolean;          
  hasDirect: boolean;           
}

export interface UnreadBadgeCounts {
  totalUnread: number;
  mentions: number;
  directMentions: number;
  allMentions: number;
  subscribedThreads: number;
  subscribedSpaces: number;
  directMessages: number;
}

export interface UnreadNotifications {
  badges: UnreadBadgeCounts;
  
  mentions: UnreadMention[];           
  directMentions: UnreadMention[];     
  allMentions: UnreadMention[];        
  subscribedThreads: UnreadThread[];   
  subscribedSpaces: UnreadSpace[];     
  directMessages: UnreadSpace[];       
  
  allUnreads: WorldItemSummary[];
  
  lastFetched: number;
  selfUserId?: string;
}

export interface GetUnreadsOptions {
  fetchMessages?: boolean;
  messagesPerSpace?: number;
  unreadOnly?: boolean;
  checkParticipation?: boolean;
  parallel?: number;
}

export interface GroupReadState {
  groupId: string;
  lastReadTime?: number;
  unreadMessageCount: number;
  starred?: boolean;
  unreadSubscribedTopicCount: number;
  unreadSubscribedTopics?: string[];  
  hasUnreadThread?: boolean;
  markAsUnreadTimestamp?: number;
  notificationSettings?: {
    muted: boolean;
    notifyAlways?: boolean;
  };
}

export interface MarkGroupReadstateResult {
  success: boolean;
  groupId: string;
  lastReadTime?: number;
  unreadMessageCount?: number;
  error?: string;
}

export interface TopicReadState {
  topicId: string;
  lastReadTime?: number;
  unreadMessageCount: number;
  readMessageCount: number;
  totalMessageCount: number;
  lastEngagementTime?: number;
  muted?: boolean;
  isFollowed?: boolean;
}

export interface AuthTokens {
  access_token: string;
  dynamite_token: string;
  id_token?: string;
  refresh_token?: string;
  timestamp: number;
}

export interface Cookies {
  [key: string]: string;
}

export interface RequestHeader {
  '1'?: unknown;
  '2': number;  
  '4': string;  
}

export interface GroupId {
  '1': { '1': string };  
}

export interface ListTopicsRequest {
  '1': RequestHeader;
  '2': number;   
  '3': number;   
  '6'?: number;  
  '7'?: number;  
  '8': GroupId;  
  '9'?: { '1': string };  
}

export interface ListMessagesRequest {
  '1': RequestHeader;
  '2': {  
    '1': {  
      '1': GroupId;  
      '2': string;   
    };
  };
  '3': number;  
}
