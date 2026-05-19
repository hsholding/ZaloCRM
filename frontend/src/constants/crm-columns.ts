/**
 * Single source of truth cho cấu hình cột của trang /crm.
 *
 * - DEFAULT cols: anh chốt theo cấu trúc Contacts/Friends hiện tại
 *   - Khách hàng: 15 cột (chưa tính checkbox + expand + action)
 *   - Bạn bè Zalo: 9 cột (chưa tính checkbox + action)
 *
 * - HIDDEN cols: trường ẩn từ schema Contact / Friend — user có thể "Hiện" qua Column Manager
 *
 * Mỗi col có `sticky: true` nếu không thể ẩn (vd cột Tên KH).
 */

export interface CrmColumnDef {
  key: string;
  label: string;
  default: boolean;
  sticky?: boolean;
  /** Source field hint cho dev (không dùng render UI). */
  source?: string;
}

/* ─── TAB 1: Khách hàng (Contact entity) ────────────────────────────── */
export const COLS_KH: CrmColumnDef[] = [
  // Default 15
  { key: 'name',       label: 'Tên CRM / Zalo (KH)', default: true, sticky: true, source: 'Contact.crmName|fullName + Friend.zaloDisplayName' },
  { key: 'phone',      label: 'SĐT',                 default: true, source: 'Contact.phone' },
  { key: 'gender',     label: 'Giới tính',           default: true, source: 'Contact.gender' },
  { key: 'province',   label: 'Tỉnh/Quận',           default: true, source: 'Contact.province + district' },
  { key: 'source',     label: 'Nguồn',               default: true, source: 'Contact.source' },
  { key: 'status',     label: 'Trạng thái KH',       default: true, source: 'Contact.statusRef.name' },
  { key: 'score',      label: 'Score',               default: true, source: 'Contact.leadScore (aggregate MAX)' },
  { key: 'nicks',      label: 'Nick chăm',           default: true, source: 'Contact.friends → distinct zaloAccount' },
  { key: 'mainsale',   label: 'Sale chính',          default: true, source: 'Contact.assignedUser' },
  { key: 'cust-last',  label: 'KH nhắn cuối',        default: true, source: 'Contact.lastInboundAt' },
  { key: 'sale-last',  label: 'Sale nhắn cuối',      default: true, source: 'Contact.lastOutboundAt + lastOutboundByUserId' },
  { key: 'msgs',       label: 'Tin in/out',          default: true, source: 'Contact.totalInbound / totalOutbound' },
  { key: 'tags',       label: 'Tags CRM',            default: true, source: 'Contact.tags' },
  { key: 'haszalo',    label: 'Có Zalo?',            default: true, source: 'Contact.hasZalo' },
  { key: 'globalid',   label: 'Global ID',           default: true, source: 'Contact.zaloGlobalId' },

  // Hidden (extended fields từ schema Contact)
  { key: 'email',        label: 'Email',              default: false, source: 'Contact.email' },
  { key: 'birthyear',    label: 'Năm sinh',           default: false, source: 'Contact.birthYear' },
  { key: 'occupation',   label: 'Nghề nghiệp',        default: false, source: 'Contact.occupation' },
  { key: 'consent',      label: 'Trạng thái consent', default: false, source: 'Contact.consentStatus' },
  { key: 'phone2',       label: 'SĐT phụ',            default: false, source: 'Contact.phone2' },
  { key: 'ward',         label: 'Phường/Xã',          default: false, source: 'Contact.ward' },
  { key: 'incomerange',  label: 'Thu nhập',           default: false, source: 'Contact.incomeRange' },
  { key: 'created',      label: 'Ngày tạo',           default: false, source: 'Contact.createdAt' },
  { key: 'updated',      label: 'Cập nhật cuối',      default: false, source: 'Contact.updatedAt' },
];

/* ─── TAB 2: Bạn bè Zalo (Friend = per-pair) ────────────────────────── */
export const COLS_BB: CrmColumnDef[] = [
  // Default 9 (sticky + 8 + action col render riêng ngoài cols)
  { key: 'name',          label: 'Khách hàng',     default: true, sticky: true, source: 'Friend.contact.fullName + parent badge' },
  { key: 'nicklog',       label: 'Nick log',       default: true, source: 'Friend.hasConversation count' },
  { key: 'crmname',       label: 'Tên CRM / Nick', default: true, source: 'Friend.aliasInNick + ZaloAccount.displayName' },
  { key: 'kb',            label: 'Trạng thái KB',  default: true, source: 'Friend.relationshipKind' },
  { key: 'status-friend', label: 'Trạng thái KH',  default: true, source: 'Friend.statusRef.name' },
  { key: 'tagscrm',       label: 'Tag CRM',        default: true, source: 'Friend.crmTagsPerNick' },
  { key: 'last-friend',   label: 'Tương tác cuối', default: true, source: 'Friend.lastInteractionAt' },
  { key: 'score-friend',  label: 'Score',          default: true, source: 'Friend.leadScore (per-pair)' },
  { key: 'msgs-friend',   label: 'Tin (in/out)',   default: true, source: 'Friend.totalInbound / totalOutbound' },

  // Hidden (extended fields từ schema Friend)
  { key: 'uid',              label: 'UID per-nick',            default: false, source: 'Friend.zaloUidInNick' },
  { key: 'globalid-friend',  label: 'Global ID',               default: false, source: 'Friend.zaloGlobalId' },
  { key: 'becamefriend',     label: 'Là bạn từ',               default: false, source: 'Friend.becameFriendAt' },
  { key: 'stucksince',       label: 'Stuck Since (Phase 6+)',  default: false, source: 'Friend.stuckSince' },
  { key: 'autotags',         label: 'Auto-tags',               default: false, source: 'Friend.autoTags' },
  { key: 'zalolabels',       label: 'Label Zalo (Real)',       default: false, source: 'Friend.zaloLabels' },
  { key: 'scorebreakdown',   label: 'Score breakdown 4 chiều', default: false, source: 'Friend.scoreBreakdown' },
];
