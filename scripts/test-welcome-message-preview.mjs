// Test welcome-message-builder — preview text + styles output + (optional) send Zalo test.
//
// Chạy:
//   node scripts/test-welcome-message-preview.mjs                           # chỉ preview text+styles
//   node scripts/test-welcome-message-preview.mjs --send --phone 0908278807 # gửi thật tới SĐT admin
//
// Mục đích: admin xác nhận template render đẹp trên Zalo trước khi code endpoint chính.

import { buildWelcomeMessage } from '../backend/src/modules/system-notifications/welcome-message-builder.js';

const args = process.argv.slice(2);
const sendMode = args.includes('--send');
const phoneIdx = args.indexOf('--phone');
const targetPhone = phoneIdx >= 0 ? args[phoneIdx + 1] : null;

const FRIEND_PAYLOAD = buildWelcomeMessage({
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

const STRANGER_PAYLOAD = buildWelcomeMessage({
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

console.log('===========================================');
console.log('VARIANT: FRIEND (sale đã kết bạn với nick hệ thống)');
console.log('===========================================');
console.log('--- Plain text ---');
console.log(FRIEND_PAYLOAD.plainText);
console.log('');
console.log(`--- Styles (${FRIEND_PAYLOAD.formatted.styles.length} ranges) ---`);
console.log(JSON.stringify(FRIEND_PAYLOAD.formatted.styles, null, 2));

console.log('');
console.log('===========================================');
console.log('VARIANT: STRANGER (sale chưa kết bạn — tin vào tab Người lạ)');
console.log('===========================================');
console.log('--- Plain text ---');
console.log(STRANGER_PAYLOAD.plainText);
console.log('');
console.log(`--- Styles (${STRANGER_PAYLOAD.formatted.styles.length} ranges) ---`);
console.log(JSON.stringify(STRANGER_PAYLOAD.formatted.styles, null, 2));

if (!sendMode) {
  console.log('');
  console.log('💡 Để gửi tin test thật qua Zalo:');
  console.log('   node scripts/test-welcome-message-preview.mjs --send --phone 0908278807');
  process.exit(0);
}

if (!targetPhone) {
  console.error('❌ --send mode yêu cầu --phone <SĐT admin>');
  process.exit(1);
}

console.log('');
console.log(`📤 Sending test message to ${targetPhone} via Zalo system notify nick...`);

const API = process.env.API_BASE || 'http://localhost:3000/api/v1';
const TOKEN = process.env.JWT_TOKEN || '';
if (!TOKEN) {
  console.error('❌ Need JWT_TOKEN env var (admin/owner token). See test-privacy-d2-pin.mjs for pattern.');
  process.exit(1);
}

const res = await fetch(`${API}/system-notifications/preview-welcome`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    targetPhone,
    variant: STRANGER_PAYLOAD,
  }),
});
const text = await res.text();
console.log(`Status: ${res.status}`);
console.log(text);
