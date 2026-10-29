import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Plus,
  Trash2,
  Edit3,
  Eye,
  Copy,
  Check,
  FileSpreadsheet,
  Download,
  Share2,
  Users,
  Building,
  Phone,
  Mail,
  MapPin,
  Tag,
  ArrowUpDown,
  MoreHorizontal,
  Sparkles,
  AlertCircle,
  X,
} from 'lucide-react';
import { Contact } from '../types/contact';

interface ContactsTableProps {
  contacts: Contact[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (visibleIds?: string[]) => void;
  onClearSelection: () => void;
  onViewContact: (contact: Contact) => void;
  onEditContact: (contact: Contact) => void;
  onDeleteContact: (id: string) => void;
  onBatchDelete: () => void;
  onAddNewContact: () => void;
  onExportExcel: () => void;
  onExportCsv: () => void;
  onGoToExportVcf: () => void;
  onLoadDemo: () => void;
  onDeduplicate: () => void;
}

/**
 * Text component that highlights occurrences of search keywords
 * Supports flexible digit matching for hyphenated / formatted phone numbers
 */
export const HighlightText: React.FC<{
  text?: string | null;
  keyword: string;
  className?: string;
}> = ({ text, keyword, className = '' }) => {
  if (!text) return null;
  const kw = keyword.trim();
  if (!kw) return <span className={className}>{text}</span>;

  let pattern = '';
  // If keyword consists of digits/hyphens/spaces (typical phone search)
  if (/^[0-9\s-]+$/.test(kw)) {
    const digits = kw.replace(/[\s-]/g, '');
    if (digits.length >= 2) {
      pattern = digits
        .split('')
        .map(d => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('[\\s-]*');
    }
  }

  if (!pattern) {
    pattern = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  try {
    const regex = new RegExp(`(${pattern})`, 'gi');
    const parts = text.split(regex);

    return (
      <span className={className}>
        {parts.map((part, i) =>
          regex.test(part) ? (
            <mark
              key={i}
              className="bg-amber-200 text-amber-950 font-bold px-0.5 rounded-xs shadow-2xs"
            >
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </span>
    );
  } catch {
    return <span className={className}>{text}</span>;
  }
};

export const ContactsTable: React.FC<ContactsTableProps> = ({
  contacts,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onClearSelection,
  onViewContact,
  onEditContact,
  onDeleteContact,
  onBatchDelete,
  onAddNewContact,
  onExportExcel,
  onExportCsv,
  onGoToExportVcf,
  onLoadDemo,
  onDeduplicate,
}) => {
  // Search states: searchInput (draft) and appliedSearch (committed on button click or Enter)
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'name' | 'phone' | 'org' | 'created'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // In-app batch delete confirmation state
  const [confirmingBatchDelete, setConfirmingBatchDelete] = useState(false);

  // Extract all unique categories
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach(c => c.categories?.forEach(cat => set.add(cat)));
    return Array.from(set);
  }, [contacts]);

  // Execute search commit
  const handleExecuteSearch = () => {
    setAppliedSearch(searchInput.trim());
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setAppliedSearch('');
  };

  // Filter & sort contacts
  const filteredContacts = useMemo(() => {
    const q = appliedSearch.toLowerCase();
    return contacts
      .filter(c => {
        // Category filter
        if (selectedCategory !== 'ALL') {
          if (!c.categories || !c.categories.includes(selectedCategory)) {
            return false;
          }
        }

        if (!q) return true;

        // Search matches across all contact fields
        const nameMatch =
          (c.fullName && c.fullName.toLowerCase().includes(q)) ||
          (c.familyName && c.familyName.toLowerCase().includes(q)) ||
          (c.givenName && c.givenName.toLowerCase().includes(q));

        const phoneMatch = c.phones.some(p => {
          const rawNum = p.number.toLowerCase();
          const cleanNum = rawNum.replace(/[\s-]/g, '');
          const cleanQ = q.replace(/[\s-]/g, '');
          return rawNum.includes(q) || (cleanQ.length >= 2 && cleanNum.includes(cleanQ));
        });

        const emailMatch = c.emails.some(
          e => e.address && e.address.toLowerCase().includes(q)
        );

        const orgMatch =
          (c.organization && c.organization.toLowerCase().includes(q)) ||
          (c.department && c.department.toLowerCase().includes(q)) ||
          (c.jobTitle && c.jobTitle.toLowerCase().includes(q));

        const noteMatch = c.notes && c.notes.toLowerCase().includes(q);
        const tagMatch =
          c.categories && c.categories.some(tag => tag.toLowerCase().includes(q));

        const addrString = [
          c.address.country,
          c.address.region,
          c.address.city,
          c.address.street,
          c.address.fullAddress,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        const addrMatch = addrString.includes(q);

        return nameMatch || phoneMatch || emailMatch || orgMatch || noteMatch || tagMatch || addrMatch;
      })
      .sort((a, b) => {
        let comparison = 0;
        if (sortBy === 'name') {
          comparison = (a.fullName || '').localeCompare(b.fullName || '', 'zh-CN');
        } else if (sortBy === 'phone') {
          const pA = a.phones[0]?.number || '';
          const pB = b.phones[0]?.number || '';
          comparison = pA.localeCompare(pB);
        } else if (sortBy === 'org') {
          comparison = (a.organization || '').localeCompare(b.organization || '', 'zh-CN');
        }
        return sortOrder === 'asc' ? comparison : -comparison;
      });
  }, [contacts, appliedSearch, selectedCategory, sortBy, sortOrder]);

  const visibleIds = useMemo(() => filteredContacts.map(c => c.id), [filteredContacts]);
  const isAllSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
  const isIndeterminate = visibleIds.some(id => selectedIds.has(id)) && !isAllSelected;

  const copyToClipboard = (text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const getAvatarBg = (name: string) => {
    const colors = [
      'bg-blue-600',
      'bg-indigo-600',
      'bg-purple-600',
      'bg-teal-600',
      'bg-emerald-600',
      'bg-amber-600',
      'bg-rose-600',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = (hash << 5) - hash + name.charCodeAt(i);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  if (contacts.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center max-w-xl mx-auto shadow-2xs my-8">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4 border border-blue-100">
          <Users className="w-8 h-8" />
        </div>
        <h3 className="text-base font-bold text-slate-800 mb-1">
          当前暂无联系人数据
        </h3>
        <p className="text-xs text-slate-500 mb-6 leading-relaxed">
          您可以上传 .vcf 文件解析通讯录，或者导入含有联系人信息的 Excel/CSV 表格，也可以一键载入内置的真实格式演示数据。
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={onLoadDemo}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            载入演示联系人 (5位)
          </button>
          <button
            onClick={onAddNewContact}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-medium cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            手动新建联系人
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: Search, Filters & Action Buttons */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Search Box with explicit Search Button */}
          <div className="flex items-center gap-1.5 flex-1 min-w-[280px]">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    handleExecuteSearch();
                  }
                }}
                placeholder="搜索联系人姓名、手机号、公司、邮箱或备注..."
                className="w-full pl-9 pr-7 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  title="清除输入"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleExecuteSearch}
              className="inline-flex items-center gap-1 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer transition-colors shrink-0"
            >
              <Search className="w-3.5 h-3.5" />
              搜索
            </button>
          </div>

          {/* Filters & Sorting */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Category Filter */}
            {allCategories.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <Tag className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={selectedCategory}
                  onChange={e => setSelectedCategory(e.target.value)}
                  className="py-1.5 px-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ALL">全部分组 ({contacts.length})</option>
                  {allCategories.map(cat => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="py-1.5 px-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="name">按姓名排序</option>
                <option value="phone">按主要电话排序</option>
                <option value="org">按公司名称排序</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                title={sortOrder === 'asc' ? '当前升序，点击切换降序' : '当前降序，点击切换升序'}
                className="px-2 py-1.5 border border-slate-300 rounded-lg text-xs hover:bg-slate-50 text-slate-600"
              >
                {sortOrder === 'asc' ? '正序 ↑' : '倒序 ↓'}
              </button>
            </div>

            {/* Deduplicate Button */}
            <button
              onClick={onDeduplicate}
              title="智能检测重复联系人并合并"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-blue-600" />
              查重合并
            </button>

            {/* Add Contact Button */}
            <button
              onClick={onAddNewContact}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              新建联系人
            </button>
          </div>
        </div>

        {/* Search Results Alert Banner */}
        {appliedSearch && (
          <div className="bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg flex items-center justify-between text-xs text-amber-900 animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <span className="font-medium">搜索关键词：</span>
              <span className="bg-amber-200 text-amber-950 font-bold px-1.5 py-0.5 rounded text-[11px]">
                "{appliedSearch}"
              </span>
              <span>
                匹配到 <strong>{filteredContacts.length}</strong> 位联系人（相同内容已在下方高亮）
              </span>
            </div>
            <button
              type="button"
              onClick={handleClearSearch}
              className="text-xs text-amber-800 hover:text-amber-950 font-semibold underline underline-offset-2 cursor-pointer"
            >
              清除搜索
            </button>
          </div>
        )}

        {/* Batch Operations Bar (Visible when rows selected) */}
        {selectedIds.size > 0 && (
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2 bg-blue-50/70 -mx-4 -mb-4 p-3 rounded-b-xl border-t-blue-100">
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-900">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">
                {selectedIds.size}
              </span>
              <span>已选择 {selectedIds.size} 位联系人</span>
              <button
                type="button"
                onClick={onClearSelection}
                className="text-xs text-blue-600 hover:text-blue-800 underline font-normal ml-2 cursor-pointer"
              >
                取消全选
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onGoToExportVcf}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-2xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                导出选中为 .vcf
              </button>

              {confirmingBatchDelete ? (
                <div className="flex items-center gap-1.5 bg-rose-100/90 border border-rose-300 p-1 rounded-md">
                  <span className="text-[11px] text-rose-800 font-semibold px-1">
                    确定删除这 {selectedIds.size} 位？
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onBatchDelete();
                      setConfirmingBatchDelete(false);
                    }}
                    className="px-2 py-0.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded cursor-pointer"
                  >
                    确认删除
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingBatchDelete(false)}
                    className="px-2 py-0.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded cursor-pointer"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingBatchDelete(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-700 bg-white hover:bg-rose-50 border border-rose-200 rounded-md cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  批量删除
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Table Header Bar */}
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-500 font-medium">
          <div className="flex items-center gap-2">
            <span>当前显示:</span>
            <strong className="text-slate-800">{filteredContacts.length}</strong>
            <span>位联系人 (共 {contacts.length} 位)</span>
            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-mono text-[11px] border border-blue-200">
              标准格式1
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onExportExcel}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              导出 Excel (.xlsx)
            </button>
            <button
              onClick={onExportCsv}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-colors cursor-pointer"
            >
              导出 CSV
            </button>
          </div>
        </div>

        {/* Scrollable Responsive Table */}
        <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-100/80 sticky top-0 z-10 text-[11px] font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200 backdrop-blur-xs">
              <tr>
                <th
                  className="py-2.5 px-3 w-10 text-center cursor-pointer select-none"
                  onClick={e => {
                    if (e.target === e.currentTarget) {
                      onToggleSelectAll(visibleIds);
                    }
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={input => {
                      if (input) input.indeterminate = isIndeterminate;
                    }}
                    onChange={() => onToggleSelectAll(visibleIds)}
                    onClick={e => e.stopPropagation()}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4"
                    title={isAllSelected ? '取消全选' : '全选所有联系人'}
                  />
                </th>
                <th className="py-2.5 px-3 min-w-[150px]">姓名</th>
                <th className="py-2.5 px-3 min-w-[140px]">主要电话</th>
                <th className="py-2.5 px-3 min-w-[120px]">备用电话</th>
                <th className="py-2.5 px-3 min-w-[180px]">电子邮箱</th>
                <th className="py-2.5 px-3 min-w-[180px]">公司 / 部门</th>
                <th className="py-2.5 px-3 min-w-[120px]">职位</th>
                <th className="py-2.5 px-3 min-w-[180px]">详细地址</th>
                <th className="py-2.5 px-3 min-w-[130px]">分组标签</th>
                <th className="py-2.5 px-3 min-w-[140px]">备注信息</th>
                <th className="py-2.5 px-3 w-28 text-center sticky right-0 bg-slate-100/90 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)]">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    <p className="text-sm font-medium text-slate-600">未找到匹配的联系人</p>
                    <p className="text-xs text-slate-400 mt-1">您可以尝试更换搜索词或清除筛选条件</p>
                    {appliedSearch && (
                      <button
                        onClick={handleClearSearch}
                        className="mt-3 px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-md border border-blue-200 cursor-pointer"
                      >
                        清除搜索内容
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredContacts.map(c => {
                  const isSelected = selectedIds.has(c.id);
                  const primaryPhone = c.phones[0];
                  const secondaryPhone = c.phones[1];
                  const primaryEmail = c.emails[0];
                  const displayName = c.fullName || '未命名';
                  const initialChar = displayName.charAt(0).toUpperCase();

                  return (
                    <tr
                      key={c.id}
                      onClick={() => onViewContact(c)}
                      className={`hover:bg-blue-50/40 cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50/70' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td
                        className="py-2.5 px-3 text-center cursor-pointer select-none"
                        onClick={e => {
                          e.stopPropagation();
                          if (e.target === e.currentTarget) {
                            onToggleSelect(c.id);
                          }
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onToggleSelect(c.id)}
                          onClick={e => e.stopPropagation()}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4"
                        />
                      </td>

                      {/* Name + Avatar */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2.5">
                          {c.photo ? (
                            <img
                              src={c.photo}
                              alt={c.fullName}
                              className="w-7 h-7 rounded-full object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div
                              className={`w-7 h-7 rounded-full ${getAvatarBg(
                                displayName
                              )} text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs`}
                            >
                              {initialChar}
                            </div>
                          )}
                          <div className="truncate">
                            <span className="font-semibold text-slate-900 block truncate">
                              <HighlightText text={displayName} keyword={appliedSearch} />
                            </span>
                            {(c.familyName || c.givenName) && (
                              <span className="text-[10px] text-slate-400 block truncate">
                                <HighlightText text={c.familyName} keyword={appliedSearch} />
                                {c.familyName && c.givenName ? ' · ' : ''}
                                <HighlightText text={c.givenName} keyword={appliedSearch} />
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Primary Phone */}
                      <td className="py-2.5 px-3">
                        {primaryPhone ? (
                          <div className="flex items-center gap-1.5 font-mono text-slate-700">
                            <span className="text-slate-900 font-medium">
                              <HighlightText text={primaryPhone.number} keyword={appliedSearch} />
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 font-sans">
                              {primaryPhone.type === 'CELL'
                                ? '手机'
                                : primaryPhone.type === 'WORK'
                                ? '工作'
                                : '电话'}
                            </span>
                            <button
                              type="button"
                              onClick={e => copyToClipboard(primaryPhone.number, e)}
                              title="复制电话号码"
                              className="text-slate-400 hover:text-blue-600 p-0.5 rounded cursor-pointer"
                            >
                              {copiedText === primaryPhone.number ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Secondary Phone */}
                      <td className="py-2.5 px-3">
                        {secondaryPhone ? (
                          <div className="flex items-center gap-1 font-mono text-slate-600">
                            <span>
                              <HighlightText text={secondaryPhone.number} keyword={appliedSearch} />
                            </span>
                            {c.phones.length > 2 && (
                              <span className="text-[10px] text-blue-600 font-sans font-medium">
                                +{c.phones.length - 2}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Email */}
                      <td className="py-2.5 px-3">
                        {primaryEmail ? (
                          <div className="flex items-center gap-1 text-slate-700 truncate max-w-[200px]">
                            <span className="truncate">
                              <HighlightText text={primaryEmail.address} keyword={appliedSearch} />
                            </span>
                            <button
                              type="button"
                              onClick={e => copyToClipboard(primaryEmail.address, e)}
                              title="复制邮箱"
                              className="text-slate-400 hover:text-blue-600 p-0.5 rounded shrink-0 cursor-pointer"
                            >
                              {copiedText === primaryEmail.address ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Organization / Dept */}
                      <td className="py-2.5 px-3">
                        {c.organization ? (
                          <div className="truncate max-w-[180px]">
                            <span className="font-medium text-slate-800 block truncate">
                              <HighlightText text={c.organization} keyword={appliedSearch} />
                            </span>
                            {c.department && (
                              <span className="text-[11px] text-slate-400 block truncate">
                                <HighlightText text={c.department} keyword={appliedSearch} />
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Job Title */}
                      <td className="py-2.5 px-3">
                        <span className="text-slate-700 truncate max-w-[120px] block">
                          {c.jobTitle ? (
                            <HighlightText text={c.jobTitle} keyword={appliedSearch} />
                          ) : (
                            '-'
                          )}
                        </span>
                      </td>

                      {/* Address */}
                      <td className="py-2.5 px-3">
                        <span
                          className="text-slate-600 truncate max-w-[180px] block"
                          title={c.address.fullAddress || c.address.street}
                        >
                          {c.address.fullAddress || c.address.street ? (
                            <HighlightText
                              text={c.address.fullAddress || c.address.street}
                              keyword={appliedSearch}
                            />
                          ) : (
                            '-'
                          )}
                        </span>
                      </td>

                      {/* Categories / Tags */}
                      <td className="py-2.5 px-3">
                        {c.categories && c.categories.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-[150px]">
                            {c.categories.slice(0, 2).map(cat => (
                              <span
                                key={cat}
                                className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 border border-slate-200"
                              >
                                <HighlightText text={cat} keyword={appliedSearch} />
                              </span>
                            ))}
                            {c.categories.length > 2 && (
                              <span className="text-[10px] text-slate-400 self-center">
                                +{c.categories.length - 2}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Notes */}
                      <td className="py-2.5 px-3">
                        <span
                          className="text-slate-500 truncate max-w-[140px] block"
                          title={c.notes}
                        >
                          {c.notes ? (
                            <HighlightText text={c.notes} keyword={appliedSearch} />
                          ) : (
                            '-'
                          )}
                        </span>
                      </td>

                      {/* Actions Sticky Column */}
                      <td
                        className="py-2.5 px-3 text-center sticky right-0 bg-white group-hover:bg-blue-50/40 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)]"
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => onViewContact(c)}
                            title="查看详情"
                            className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onEditContact(c)}
                            title="编辑联系人"
                            className="p-1 rounded text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteContact(c.id)}
                            title="删除"
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
