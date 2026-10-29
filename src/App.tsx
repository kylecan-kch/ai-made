import React, { useState, useEffect } from 'react';
import {
  FileText,
  Table as TableIcon,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Info,
  ShieldCheck,
} from 'lucide-react';
import { Contact } from './types/contact';
import { Navbar } from './components/Navbar';
import { ImportPanel } from './components/ImportPanel';
import { ContactsTable } from './components/ContactsTable';
import { ContactDrawer } from './components/ContactDrawer';
import { ExportPanel } from './components/ExportPanel';
import { DeduplicateModal } from './components/DeduplicateModal';
import { OfflineDownloadModal } from './components/OfflineDownloadModal';
import {
  getDemoContacts,
  downloadStandardTemplate,
  exportContactsToExcel,
  exportContactsToCsv,
} from './utils/tableFormat';
import { generateId } from './utils/vcard';

const STORAGE_KEY = 'vcf_hub_contacts_v1';

export default function App() {
  // Navigation Tab: 'table' | 'import' | 'export'
  const [activeTab, setActiveTab] = useState<'table' | 'import' | 'export'>('table');

  // Contacts state
  const [contacts, setContacts] = useState<Contact[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      // ignore
    }
    return getDemoContacts();
  });

  // Selected row IDs
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Contact Drawer state (view / edit)
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isDrawerEditing, setIsDrawerEditing] = useState(false);

  // Deduplicate Modal
  const [isDeduplicateOpen, setIsDeduplicateOpen] = useState(false);

  // Offline Download / EXE Modal
  const [isOfflineModalOpen, setIsOfflineModalOpen] = useState(false);

  // Global notification banner
  const [notification, setNotification] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);

  // Save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
    } catch (e) {
      // quota or private mode
    }
  }, [contacts]);

  const showNotification = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNotification({ text, type });
    setTimeout(() => {
      setNotification(prev => (prev?.text === text ? null : prev));
    }, 3500);
  };

  // Selection handlers
  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.size === contacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contacts.map(c => c.id)));
    }
  };

  // Contacts mutations
  const handleSaveContact = (updated: Contact) => {
    setContacts(prev => {
      const index = prev.findIndex(c => c.id === updated.id);
      if (index >= 0) {
        const next = [...prev];
        next[index] = updated;
        return next;
      } else {
        return [updated, ...prev];
      }
    });
    setActiveContact(updated);
    showNotification(`联系人「${updated.fullName}」已成功保存！`);
  };

  const handleDeleteContact = (id: string) => {
    setContacts(prev => prev.filter(c => c.id !== id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    showNotification('联系人已删除', 'info');
  };

  const handleBatchDelete = () => {
    if (!confirm(`确定要删除选中的 ${selectedIds.size} 位联系人吗？此操作无法撤销。`)) {
      return;
    }
    setContacts(prev => prev.filter(c => !selectedIds.has(c.id)));
    showNotification(`已批量删除 ${selectedIds.size} 位联系人`);
    setSelectedIds(new Set());
  };

  const handleAddNewContact = () => {
    const newContact: Contact = {
      id: 'c_new_' + generateId(),
      fullName: '',
      familyName: '',
      givenName: '',
      phones: [{ number: '', type: 'CELL' }],
      emails: [{ address: '', type: 'WORK' }],
      organization: '',
      department: '',
      jobTitle: '',
      address: {
        street: '',
        city: '',
        region: '',
        postalCode: '',
        country: '',
      },
      notes: '',
      birthday: '',
      website: '',
      categories: [],
    };
    setActiveContact(newContact);
    setIsDrawerEditing(true);
    setIsDrawerOpen(true);
  };

  const handleViewContact = (contact: Contact) => {
    setActiveContact(contact);
    setIsDrawerEditing(false);
    setIsDrawerOpen(true);
  };

  const handleEditContact = (contact: Contact) => {
    setActiveContact(contact);
    setIsDrawerEditing(true);
    setIsDrawerOpen(true);
  };

  const handleImportedContacts = (
    newContacts: Contact[],
    mode: 'replace' | 'append',
    sourceName: string
  ) => {
    if (mode === 'replace') {
      setContacts(newContacts);
      setSelectedIds(new Set());
      showNotification(`已导入 ${newContacts.length} 位联系人并替换现有数据 (${sourceName})`);
    } else {
      setContacts(prev => [...prev, ...newContacts]);
      showNotification(`已成功追加 ${newContacts.length} 位联系人 (${sourceName})`);
    }
    setActiveTab('table');
  };

  const handleLoadDemo = () => {
    const demos = getDemoContacts();
    setContacts(demos);
    setSelectedIds(new Set());
    showNotification('已重置并载入标准演示联系人数据');
  };

  const handleClearAll = () => {
    if (confirm('确定要清空当前的全部联系人列表吗？')) {
      setContacts([]);
      setSelectedIds(new Set());
      showNotification('通讯录数据已全部清空', 'info');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans antialiased selection:bg-blue-600 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        contacts={contacts}
        onLoadDemo={handleLoadDemo}
        onClearAll={handleClearAll}
        onDownloadTemplate={downloadStandardTemplate}
        onOpenOfflineModal={() => setIsOfflineModalOpen(true)}
      />

      {/* Global Notification Toast */}
      {notification && (
        <div className="fixed top-18 right-6 z-50 animate-in fade-in slide-in-from-top duration-200">
          <div
            className={`px-4 py-2.5 rounded-xl shadow-lg border flex items-center gap-2.5 text-xs font-semibold ${
              notification.type === 'success'
                ? 'bg-emerald-600 text-white border-emerald-500'
                : notification.type === 'error'
                ? 'bg-rose-600 text-white border-rose-500'
                : 'bg-slate-800 text-white border-slate-700'
            }`}
          >
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Info className="w-4 h-4" />
            )}
            <span>{notification.text}</span>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full flex flex-col space-y-5">
        {/* Navigation Tabs Bar */}
        <div className="flex items-center justify-between border-b border-slate-200/90 pb-2">
          <div className="flex items-center gap-2 bg-slate-200/70 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('table')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'table'
                  ? 'bg-white text-blue-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TableIcon className="w-4 h-4" />
              <span>联系人表格 (格式1)</span>
              <span className="ml-1 text-[11px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600">
                {contacts.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('import')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'import'
                  ? 'bg-white text-blue-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-4 h-4 text-emerald-600" />
              <span>导入与解析</span>
              <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1 rounded border border-emerald-200">
                .vcf / .xlsx
              </span>
            </button>

            <button
              onClick={() => setActiveTab('export')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'export'
                  ? 'bg-white text-blue-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Download className="w-4 h-4 text-blue-600" />
              <span>生成与导出 .vcf</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>本地客户端即时解析 · 零数据上传 · 隐私安全</span>
          </div>
        </div>

        {/* Tab 1: Format 1 Table */}
        {activeTab === 'table' && (
          <ContactsTable
            contacts={contacts}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
            onViewContact={handleViewContact}
            onEditContact={handleEditContact}
            onDeleteContact={handleDeleteContact}
            onBatchDelete={handleBatchDelete}
            onAddNewContact={handleAddNewContact}
            onExportExcel={() => exportContactsToExcel(contacts)}
            onExportCsv={() => exportContactsToCsv(contacts)}
            onGoToExportVcf={() => setActiveTab('export')}
            onLoadDemo={handleLoadDemo}
            onDeduplicate={() => setIsDeduplicateOpen(true)}
          />
        )}

        {/* Tab 2: Import & Parse Dropzones */}
        {activeTab === 'import' && (
          <ImportPanel
            onContactsImported={handleImportedContacts}
            onDownloadTemplate={downloadStandardTemplate}
            onGoToTable={() => setActiveTab('table')}
          />
        )}

        {/* Tab 3: Generate & Export .vcf */}
        {activeTab === 'export' && (
          <ExportPanel
            contacts={contacts}
            selectedIds={selectedIds}
            onGoToTable={() => setActiveTab('table')}
          />
        )}
      </main>

      {/* Slide-over Contact Detail / Edit Drawer */}
      <ContactDrawer
        contact={activeContact}
        isOpen={isDrawerOpen}
        isEditing={isDrawerEditing}
        onClose={() => setIsDrawerOpen(false)}
        onSave={handleSaveContact}
        onDelete={handleDeleteContact}
      />

      {/* Deduplicate & Merge Modal */}
      <DeduplicateModal
        contacts={contacts}
        isOpen={isDeduplicateOpen}
        onClose={() => setIsDeduplicateOpen(false)}
        onApplyMerged={merged => {
          setContacts(merged);
          setSelectedIds(new Set());
          showNotification(`查重合并完成，当前有效联系人共 ${merged.length} 位`);
        }}
      />

      {/* Offline Standalone & EXE Packaging Modal */}
      <OfflineDownloadModal
        isOpen={isOfflineModalOpen}
        onClose={() => setIsOfflineModalOpen(false)}
      />

      {/* Subtle Footer */}
      <footer className="border-t border-slate-200 bg-white py-3.5 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-400">
          VCF Contacts Hub · 自动解析 .vcf 与 格式1 表格互转工具 · 符合 RFC 2426 / 6350 规范
        </div>
      </footer>
    </div>
  );
}
