# Data Model Decisions

## Contact vs Friend la quyet dinh goc

He thong dung mo hinh "2 cuon so":

- `Contact`: ho so KH cha. Luu thuoc tinh cua con nguoi/to chuc: ten CRM, phone, source, dia chi, assigned user, profile fields, aggregate score/status/message counters/cache.
- `Friend`: phieu cham soc con. Moi row la mot cap `zaloAccountId x Zalo identity/contact`. Luu goc nhin rieng cua nick CRM: `zaloUidInNick`, display name/avatar Zalo, alias, labels, relationship status, score/status per-pair, counters per-pair.

Quan trong: cung mot KH co the nong voi nick A nhung nguoi voi nick B. Vi vay code dung cho chat/sale view thuong lay `Friend`; manager/list/dashboard thuong lay `Contact` aggregate.

## Identity Zalo

- UID co the khac theo account viewer, nen UID chinh xac phai nam tren `Friend`.
- `Contact` chi giu snapshot/aggregate de query nhanh va legacy display.
- Khi can hien thi multi-nick/multi-identity, expand tu `Contact` sang cac `Friend` rows.

## Score va stage

Phase 6 chot:

- Score primary o `Friend`.
- `Contact.leadScore` la aggregate, theo thiet ke ban dau la MAX Friend score de manager thay KH co tiem nang qua bat ky nick nao.
- Score breakdown 4 chieu: Engagement, Intent, Fit, Velocity.
- Weights da chot trong TODO/Phase 6: E 35, I 30, F 15, V 20.
- Stage 5 "Tiem nang" nam sau "Nong", gan "Chot".
- Stuck dashboard group theo Contact de tranh lap KH nhieu lan theo nick.

## Activity/Note/Appointment/Message la so phu

- `ActivityLog`: timeline/audit. Dung cho user action va system action.
- `Note`: note theo Contact, co reply 1 cap va reaction.
- `Appointment`: lich hen theo Contact, co cache tren Contact cho lich sap toi/tong so.
- `Conversation` + `Message`: nguon chat that, aggregate ve Contact/Friend cho last message/counter.

## Friend sync unification

Plan `Giai_thich.md` va `plans/friend-sync-unification-2026-05-19.md` chot huong:

- Tao serializer canonical cho Friend de Contacts/Friends khong drift field.
- Sync Zalo friends dinh ky 15 phut, sequential per account de tranh rate-limit.
- Chi emit socket patch khi co thay doi that.
- Nut "Dong bo Zalo" thanh "Lam moi ngay", co cooldown.
- Friends page co mode "tat ca nick" theo quyen truy cap.

## System notification

Module `system-notifications` dung mot nick Zalo he thong de gui thong bao noi bo. Design moi trong `docs/DESIGN-INTERNAL-CONTACT-2METHOD.md` mo rong setup theo 2 cach:

- Sale's own Zalo nick ket ban voi nick he thong.
- Nick he thong ket ban voi Zalo personal phone cua sale.

Schema giu `SystemNotifyRecipient`, them status/verify fields theo migration hien co.
