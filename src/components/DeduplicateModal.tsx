import React, { useMemo } from 'react';
import { X, Users, AlertTriangle, ArrowRight, Merge, CheckCircle2 } from 'lucide-react';
import { Contact, PhoneEntry, EmailEntry } from '../types/contact';

interface DeduplicateModalProps {
  contacts: Contact[];
  isOpen: boolean;
  onClose: () => void;
  onApplyMerged: (mergedContacts: Contact[]) => void;
}

interface DuplicateGroup {
  reason: 'phone' | 'name';
  identifier: string;
  items: Contact[];
}

export const DeduplicateModal: React.FC<DeduplicateModalProps> = ({
  contacts,
  isOpen,
  onClose,
  onApplyMerged,
}) => {
  // Find duplicate groups
  const duplicateGroups = useMemo(() => {
    const phoneMap = new Map<string, Contact[]>();
    const nameMap = new Map<string, Contact[]>();

    contacts.forEach(c => {
      // Group by normalized phone
      c.phones.forEach(p => {
        const clean = p.number.replace(/\D/g, '');
        if (clean.length >= 7) {
          const list = phoneMap.get(clean) || [];
          list.push(c);
          phoneMap.set(clean, list);
        }
      });

      // Group by exact full name
      const cleanName = c.fullName.trim().toLowerCase();
      if (cleanName && cleanName !== '未命名' && cleanName !== '未命名联系人') {
        const list = nameMap.get(cleanName) || [];
        list.push(c);
        nameMap.set(cleanName, list);
      }
    });

    const groups: DuplicateGroup[] = [];
    const seenContactPairs = new Set<string>();

    // Phone duplicates
    phoneMap.forEach((items, phone) => {
      const unique = Array.from(new Set(items));
      if (unique.length > 1) {
        const key = unique.map(u => u.id).sort().join(',');
        if (!seenContactPairs.has(key)) {
          seenContactPairs.add(key);
          groups.push({
            reason: 'phone',
            identifier: `电话一致 (${phone})`,
            items: unique,
          });
        }
      }
    });

    // Name duplicates
    nameMap.forEach((items, name) => {
      const unique = Array.from(new Set(items));
      if (unique.length > 1) {
        const key = unique.map(u => u.id).sort().join(',');
        if (!seenContactPairs.has(key)) {
          seenContactPairs.add(key);
          groups.push({
            reason: 'name',
            identifier: `姓名一致 (${items[0].fullName})`,
            items: unique,
          });
        }
      }
    });

    return groups;
  }, [contacts]);

  if (!isOpen) return null;

  const handleMergeAll = () => {
    // Merge logic: Combine duplicate records
    const processedIds = new Set<string>();
    const finalContacts: Contact[] = [];

    // Helper to merge list of contacts into one
    const mergeContactList = (list: Contact[]): Contact => {
      const base = { ...list[0] };
      const allPhones: PhoneEntry[] = [];
      const allEmails: EmailEntry[] = [];
      const allCategories = new Set<string>();
      const notes: string[] = [];

      list.forEach(c => {
        // Phones
        c.phones.forEach(p => {
          if (!allPhones.some(existing => existing.number === p.number)) {
            allPhones.push(p);
          }
        });
        // Emails
        c.emails.forEach(e => {
          if (!allEmails.some(existing => existing.address.toLowerCase() === e.address.toLowerCase())) {
            allEmails.push(e);
          }
        });
        // Categories
        c.categories.forEach(cat => allCategories.add(cat));
        // Notes
        if (c.notes && !notes.includes(c.notes)) {
          notes.push(c.notes);
        }
        // Organization / Title fallback
        if (!base.organization && c.organization) base.organization = c.organization;
        if (!base.department && c.department) base.department = c.department;
        if (!base.jobTitle && c.jobTitle) base.jobTitle = c.jobTitle;
        if (!base.address.street && c.address.street) base.address = c.address;
        if (!base.birthday && c.birthday) base.birthday = c.birthday;
        if (!base.website && c.website) base.website = c.website;
      });

      base.phones = allPhones;
      base.emails = allEmails;
      base.categories = Array.from(allCategories);
      base.notes = notes.join('；');

      return base;
    };

    duplicateGroups.forEach(grp => {
      const merged = mergeContactList(grp.items);
      finalContacts.push(merged);
      grp.items.forEach(c => processedIds.add(c.id));
    });

    // Add remaining un-duplicated contacts
    contacts.forEach(c => {
      if (!processedIds.has(c.id)) {
        finalContacts.push(c);
      }
    });

    onApplyMerged(finalContacts);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                智能查重与合并
              </h3>
              <p className="text-[11px] text-slate-500">
                根据姓名或手机号自动识别重复的联系人记录
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4 text-xs">
          {duplicateGroups.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
              <p className="font-semibold text-slate-800 text-sm">
                太棒了！未检测到重复的联系人
              </p>
              <p className="text-slate-500 text-xs mt-1">
                当前通讯录中所有联系人的姓名与电话号码均独一无二。
              </p>
            </div>
          ) : (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5 text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">
                    检测到 {duplicateGroups.length} 组疑似重复记录
                  </span>
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    点击下方「一键合并重复项」后，将自动合并多条电话、邮箱、备注并保留完整信息。
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {duplicateGroups.map((grp, idx) => (
                  <div
                    key={idx}
                    className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-600" />
                        {grp.identifier}
                      </span>
                      <span className="text-[11px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                        {grp.items.length} 个重复条目
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {grp.items.map(item => (
                        <div
                          key={item.id}
                          className="bg-white p-2.5 rounded-lg border border-slate-200 text-slate-700 space-y-1"
                        >
                          <div className="font-semibold text-slate-900">
                            {item.fullName}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {item.organization || '无公司'} · {item.jobTitle || '无职位'}
                          </div>
                          <div className="text-[11px] font-mono text-blue-700">
                            {item.phones.map(p => p.number).join(', ') || '无电话'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            关闭
          </button>
          {duplicateGroups.length > 0 && (
            <button
              onClick={handleMergeAll}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Merge className="w-3.5 h-3.5" />
              一键合并全部重复项
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
