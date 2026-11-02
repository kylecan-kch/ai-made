/**
 * Synthetic performance benchmark: `npm run bench` (tsx scripts/bench-contacts.ts)
 */
import { parseVCard, generateVCard } from '../src/utils/vcard';
import { contactsToFormat1Rows, format1RowsToContacts, FORMAT1_COLUMNS } from '../src/utils/tableFormat';
import * as XLSX from 'xlsx';
import { findDuplicateGroups, mergeAllDuplicates } from '../src/utils/dedupe';
import { decodeTextBuffer } from '../src/utils/encoding';
import type { Contact } from '../src/types/contact';
const SUR = '王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗';
const GIV = '伟芳娜敏静丽强磊军洋勇艳杰涛明超秀霞平刚';
function synth(n: number): Contact[] {
  const out: Contact[] = [];
  for (let i = 0; i < n; i++) {
    const f = SUR[i % 20], g = GIV[(i * 7) % 20] + GIV[(i * 13) % 20];
    out.push({ id: 'b' + i, fullName: f + g, familyName: f, givenName: g,
      phones: [{ number: '138' + String(i).padStart(8, '0'), type: 'CELL' }, { number: '010-' + String(80000000 + i), type: 'WORK' }],
      emails: [{ address: `user${i}@example.com`, type: 'WORK' }],
      organization: '公司' + (i % 500), department: '部门, 研发; 一组', jobTitle: '工程师',
      address: { street: '中关村大街' + i + '号', city: '北京', region: '北京', postalCode: '100080', country: '中国' },
      notes: '备注\n第二行 ' + i, birthday: '1990-01-01', website: 'https://e.com/' + i, categories: ['同事', 'VIP'] });
  }
  return out;
}
const t = (label: string, fn: () => any) => { const s = performance.now(); const r = fn(); console.log(label.padEnd(34), (performance.now() - s).toFixed(0).padStart(6) + ' ms'); return r; };
for (const n of [10000, 50000]) {
  console.log(`--- n=${n}`);
  const cs = synth(n);
  const vcf30 = t('generateVCard 3.0', () => generateVCard(cs, { version: '3.0', encoding: 'utf-8' }));
  const vcf21 = t('generateVCard 2.1 QP', () => generateVCard(cs, { version: '2.1', encoding: 'quoted-printable' }));
  console.log('  vcf size MB', (vcf30.length / 1e6).toFixed(1), (vcf21.length / 1e6).toFixed(1));
  const p30 = t('parseVCard 3.0', () => parseVCard(vcf30));
  const p21 = t('parseVCard 2.1 QP', () => parseVCard(vcf21));
  console.log('  parsed', p30.length, p21.length);
  const rows = t('contactsToFormat1Rows', () => contactsToFormat1Rows(cs));
  t('format1RowsToContacts', () => format1RowsToContacts(rows));
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...FORMAT1_COLUMNS] });
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 's');
  const xbuf = t('XLSX write (array)', () => XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
  const wb2 = t('XLSX read', () => XLSX.read(xbuf, { type: 'array' }));
  t('sheet_to_json', () => XLSX.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]], { defval: '' }));
  t('decodeTextBuffer (UTF-8 VCF)', () => decodeTextBuffer(new TextEncoder().encode(vcf30)));
  const dupes = cs.concat(cs.slice(0, n / 5).map((c, i) => ({ ...c, id: 'd' + i, phones: [{ number: '+86 ' + c.phones[0].number, type: 'CELL' as const }] })));
  const groups = t(`findDuplicateGroups (${dupes.length})`, () => findDuplicateGroups(dupes));
  t('mergeAllDuplicates', () => mergeAllDuplicates(dupes, groups));
  const heap = process.memoryUsage().heapUsed / 1e6; console.log('  heapUsed MB', heap.toFixed(0));
}
// adversarial: many BEGIN without END
const adv = 'BEGIN:VCARD\nFN:x\n'.repeat(20000);
t('ReDoS: 20k BEGIN without END', () => parseVCard(adv));
