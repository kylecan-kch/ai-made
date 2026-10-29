import React from 'react';
import { Contact2, Download, Trash2, FileSpreadsheet, RefreshCw, Sparkles, CheckCircle2, Package } from 'lucide-react';
import { Contact } from '../types/contact';

interface NavbarProps {
  contacts: Contact[];
  onLoadDemo: () => void;
  onClearAll: () => void;
  onDownloadTemplate: () => void;
  onOpenOfflineModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  contacts,
  onLoadDemo,
  onClearAll,
  onDownloadTemplate,
  onOpenOfflineModal,
}) => {
  const withPhones = contacts.filter(c => c.phones.length > 0).length;
  const withEmails = contacts.filter(c => c.emails.length > 0).length;
  const withOrgs = contacts.filter(c => c.organization).length;

  return (
    <header className="border-b border-slate-200 bg-white sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between py-3.5 gap-3">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm ring-4 ring-blue-50">
              <Contact2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                  VCF Contacts Hub
                </h1>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                  格式1 互转
                </span>
              </div>
              <p className="text-xs text-slate-500">
                .vcf 联系人解析与 Excel/CSV 表格双向转换器
              </p>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="hidden lg:flex items-center gap-4 text-xs text-slate-600 bg-slate-50 py-1.5 px-3 rounded-lg border border-slate-200/70">
            <div className="flex items-center gap-1.5 font-medium">
              <span className="text-slate-400">总联系人:</span>
              <span className="text-blue-700 font-bold bg-white px-2 py-0.5 rounded border border-slate-200">
                {contacts.length}
              </span>
            </div>
            <div className="w-px h-3.5 bg-slate-200" />
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">含电话:</span>
              <span className="text-emerald-700 font-semibold">{withPhones}</span>
            </div>
            <div className="w-px h-3.5 bg-slate-200" />
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">含邮箱:</span>
              <span className="text-indigo-700 font-semibold">{withEmails}</span>
            </div>
            <div className="w-px h-3.5 bg-slate-200" />
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">含公司:</span>
              <span className="text-amber-700 font-semibold">{withOrgs}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onOpenOfflineModal}
              title="打包生成离线单文件网页或 Windows 套壳 EXE"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <Package className="w-3.5 h-3.5 text-purple-600" />
              打包离线网页 / EXE
            </button>

            <button
              onClick={onDownloadTemplate}
              title="下载包含标准列头的 Excel 导入模板"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              下载格式1模板
            </button>

            <button
              onClick={onLoadDemo}
              title="载入多条真实格式示例数据进行体验"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              载入演示数据
            </button>

            {contacts.length > 0 && (
              <button
                onClick={onClearAll}
                title="清空当前所有联系人数据"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                清空
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
