// Test welcome-message-builder — preview text + styles output.
// Chạy: cd backend && npx tsx ../scripts/test-welcome-message-preview.ts
import { buildWelcomeMessage } from '../backend/src/modules/system-notifications/welcome-message-builder.js';

// Pass null để dùng DEFAULT_WELCOME_TEMPLATE (anh có thể test bằng cách paste custom template vào string).
const TEMPLATE: string | null = null;

const FRIEND_PAYLOAD = buildWelcomeMessage(TEMPLATE, {
  fullName: 'Nguyễn Văn A',
  email: 'nguyenvana@hsholding.vn',
  phone: '0931536109',
  password: 'a3k7p9',
  loginUrl: 'https://crm.hsholding.vn',
  orgName: 'ZaloCRM HS Holding',
  departmentName: 'Phòng Kinh Doanh',
  roleName: 'Nhân viên Sale',
  adminPhone: '0908278807',
  variant: 'friend',
});

const STRANGER_PAYLOAD = buildWelcomeMessage(TEMPLATE, {
  fullName: 'Nguyễn Văn A',
  email: 'nguyenvana@hsholding.vn',
  phone: '0931536109',
  password: 'a3k7p9',
  loginUrl: 'https://crm.hsholding.vn',
  orgName: 'ZaloCRM HS Holding',
  departmentName: 'Phòng Kinh Doanh',
  roleName: 'Nhân viên Sale',
  adminPhone: '0908278807',
  variant: 'stranger',
});

console.log('=== VARIANT: FRIEND ===');
console.log(FRIEND_PAYLOAD.plainText);
console.log(`\nstyles: ${FRIEND_PAYLOAD.formatted.styles.length} ranges`);
for (const s of FRIEND_PAYLOAD.formatted.styles) {
  const slice = FRIEND_PAYLOAD.formatted.text.slice(s.offset, s.offset + s.length);
  console.log(`  [${s.offset}+${s.length}] ${s.style}${s.color ? '(' + s.color + ')' : ''} → "${slice}"`);
}

console.log('\n=== VARIANT: STRANGER ===');
console.log(STRANGER_PAYLOAD.plainText);
console.log(`\nstyles: ${STRANGER_PAYLOAD.formatted.styles.length} ranges`);
for (const s of STRANGER_PAYLOAD.formatted.styles) {
  const slice = STRANGER_PAYLOAD.formatted.text.slice(s.offset, s.offset + s.length);
  console.log(`  [${s.offset}+${s.length}] ${s.style}${s.color ? '(' + s.color + ')' : ''} → "${slice}"`);
}
