import { Contact, PhoneEntry, EmailEntry } from '../types/contact';

export interface DuplicateGroup {
  reason: 'phone' | 'name';
  identifier: string;
  items: Contact[];
}

/**
 * Normalize a phone number into a comparison key:
 * digits only, and the China country code (+86 / 0086 / 86) is removed in front of
 * an 11-digit mobile number so "+86 138-0013-8000" matches "13800138000".
 */
export function phoneKey(raw: string): string {
  let digits = (raw || '').replace(/\D/g, '');
  const m = /^(?:0086|86)(1\d{10})$/.exec(digits);
  if (m) digits = m[1];
  return digits;
}

function nameKey(c: Contact): string {
  const n = (c.fullName || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!n || n === '未命名' || n === '未命名联系人') return '';
  return n;
}

/**
 * Find duplicate groups as connected components (union-find): contacts sharing a phone OR an exact
 * name are grouped together transitively, so each contact belongs to exactly one group.
 * The old implementation built phone groups and name groups independently, so a contact present in
 * both (A~B by phone, A~C by name) ended up in two groups and was emitted twice after merging.
 */
export function findDuplicateGroups(contacts: Contact[]): DuplicateGroup[] {
  const parent = contacts.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    // keep the earliest index as root so output order is stable
    if (ra < rb) parent[rb] = ra;
    else parent[ra] = rb;
  };

  const firstByPhone = new Map<string, number>();
  const firstByName = new Map<string, number>();
  // reason/identifier of the first link that joined each pair of components
  const phoneHit = new Map<number, string>();
  const nameHit = new Map<number, string>();

  contacts.forEach((c, i) => {
    for (const p of c.phones || []) {
      const key = phoneKey(p.number);
      if (key.length < 7) continue;
      const first = firstByPhone.get(key);
      if (first === undefined) firstByPhone.set(key, i);
      else if (first !== i) {
        union(first, i);
        phoneHit.set(first, key);
      }
    }
    const nk = nameKey(c);
    if (nk) {
      const first = firstByName.get(nk);
      if (first === undefined) firstByName.set(nk, i);
      else {
        union(first, i);
        nameHit.set(first, c.fullName);
      }
    }
  });

  const byRoot = new Map<number, number[]>();
  contacts.forEach((_, i) => {
    const r = find(i);
    const list = byRoot.get(r);
    if (list) list.push(i);
    else byRoot.set(r, [i]);
  });

  const groups: DuplicateGroup[] = [];
  byRoot.forEach(indices => {
    if (indices.length < 2) return;
    let phone: string | undefined;
    let name: string | undefined;
    for (const i of indices) {
      if (!phone && phoneHit.has(i)) phone = phoneHit.get(i);
      if (!name && nameHit.has(i)) name = nameHit.get(i);
    }
    groups.push(
      phone
        ? { reason: 'phone', identifier: `电话一致 (${phone})`, items: indices.map(i => contacts[i]) }
        : { reason: 'name', identifier: `姓名一致 (${name ?? contacts[indices[0]].fullName})`, items: indices.map(i => contacts[i]) }
    );
  });
  // byRoot iterates roots in ascending index order (root = smallest index), so groups are already ordered
  return groups;
}

/**
 * Merge a list of duplicate contacts into one record (first record wins for scalar fields;
 * phones / emails / categories / notes are unioned).
 */
export function mergeContactList(list: Contact[]): Contact {
  const base: Contact = { ...list[0], address: { ...list[0].address } };
  const allPhones: PhoneEntry[] = [];
  const seenPhones = new Set<string>();
  const allEmails: EmailEntry[] = [];
  const seenEmails = new Set<string>();
  const allCategories = new Set<string>();
  const notes: string[] = [];
  const seenNotes = new Set<string>();

  list.forEach(c => {
    (c.phones || []).forEach(p => {
      // Compare normalized numbers so "138 0013 8000" and "+86 13800138000" are not kept twice
      const key = phoneKey(p.number) || p.number;
      if (!seenPhones.has(key)) {
        seenPhones.add(key);
        allPhones.push(p);
      }
    });
    (c.emails || []).forEach(e => {
      const key = (e.address || '').trim().toLowerCase();
      if (!seenEmails.has(key)) {
        seenEmails.add(key);
        allEmails.push(e);
      }
    });
    (c.categories || []).forEach(cat => allCategories.add(cat));
    if (c.notes && !seenNotes.has(c.notes)) {
      seenNotes.add(c.notes);
      notes.push(c.notes);
    }
    if (!base.familyName && !base.givenName && (c.familyName || c.givenName)) {
      base.familyName = c.familyName;
      base.givenName = c.givenName;
    }
    if (!base.organization && c.organization) base.organization = c.organization;
    if (!base.department && c.department) base.department = c.department;
    if (!base.jobTitle && c.jobTitle) base.jobTitle = c.jobTitle;
    if (!base.address.street && c.address?.street) base.address = { ...c.address };
    if (!base.birthday && c.birthday) base.birthday = c.birthday;
    if (!base.website && c.website) base.website = c.website;
    if (!base.photo && c.photo) base.photo = c.photo;
  });

  base.phones = allPhones;
  base.emails = allEmails;
  base.categories = Array.from(allCategories);
  base.notes = notes.join('；');
  return base;
}

/**
 * Merge every duplicate group. Each merged record takes the position of its first member,
 * so the relative order of the address book is preserved (previously merged records were
 * moved to the top).
 */
export function mergeAllDuplicates(contacts: Contact[], groups: DuplicateGroup[] = findDuplicateGroups(contacts)): Contact[] {
  const groupOf = new Map<string, DuplicateGroup>();
  groups.forEach(g => g.items.forEach(c => groupOf.set(c.id, g)));
  const emitted = new Set<DuplicateGroup>();
  const out: Contact[] = [];
  for (const c of contacts) {
    const g = groupOf.get(c.id);
    if (!g) {
      out.push(c);
    } else if (!emitted.has(g)) {
      emitted.add(g);
      out.push(mergeContactList(g.items));
    }
  }
  return out;
}
