import React, { useState, useMemo } from 'react';
import {
  Download,
  Copy,
  Check,
  FileCode,
  FileSpreadsheet,
  Settings,
  Sparkles,
  Info,
  Smartphone,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { Contact, VCardExportOptions } from '../types/contact';
import { generateVCard } from '../utils/vcard';
import { exportContactsToExcel, exportContactsToCsv } from '../utils/tableFormat';

interface ExportPanelProps {
  contacts: Contact[];
  selectedIds: Set<string>;
  onGoToTable: () => void;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({
  contacts,
  selectedIds,
  onGoToTable,
}) => {
  const [version, setVersion] = useState<VCardExportOptions['version']>('3.0');
  const [encoding, setEncoding] = useState<VCardExportOptions['encoding']>('utf-8');
  const [exportScope, setExportScope] = useState<'all' | 'selected'>('all');
  
  // Format current date for default filename
  const defaultFilename = useMemo(() => {
    const now = new Date();
    const dStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    return `contacts_export_${dStr}.vcf`;
  }, []);

  const [filename, setFilename] = useState(defaultFilename);
  const [copied, setCopied] = useState(false);

  // Target contacts to export
  const targetContacts = useMemo(() => {
    if (exportScope === 'selected' && selectedIds.size > 0) {
      return contacts.filter(c => selectedIds.has(c.id));
    }
    return contacts;
  }, [contacts, exportScope, selectedIds]);

  // Generate vCard string
  const vcfOutput = useMemo(() => {
    if (targetContacts.length === 0) return '';
    return generateVCard(targetContacts, { version, encoding });
  }, [targetContacts, version, encoding]);

  const handleDownloadVcf = () => {
    if (!vcfOutput) return;
    const blob = new Blob([vcfOutput], { type: 'text/vcard;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.vcf') ? filename : `${filename}.vcf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyVcf = () => {
    if (!vcfOutput) return;
    navigator.clipboard.writeText(vcfOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (contacts.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center max-w-lg mx-auto shadow-2xs my-8">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
          <FileCode className="w-7 h-7" />
        </div>
        <h3 className="text-sm font-bold text-slate-800 mb-1">
          当前没有可导出的联系人
        </h3>
        <p className="text-xs text-slate-500 mb-5">
          请先导入 .vcf 文件或联系人表格，然后即可在此生成并导出 .vcf 文件。
        </p>
        <button
          onClick={onGoToTable}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
        >
          前往联系人中心 <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Download className="w-5 h-5 text-blue-600" />
              生成与导出 .vcf 文件
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              将表格数据一键编码为高兼容性 .vcf 通讯录文件，适用于苹果 iPhone、华为、小米、OPPO/vivo、微信、Outlook 及 Google
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadVcf}
              disabled={targetContacts.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              立即下载 .vcf 文件 ({targetContacts.length}人)
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings Column */}
        <div className="lg:col-span-1 space-y-5">
          {/* Export Settings Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4 text-xs">
            <h3 className="font-bold text-slate-900 flex items-center gap-2 text-sm border-b border-slate-100 pb-2.5">
              <Settings className="w-4 h-4 text-blue-600" />
              导出参数配置
            </h3>

            {/* Scope */}
            <div className="space-y-1.5">
              <label className="block font-semibold text-slate-700">导出范围</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setExportScope('all')}
                  className={`p-2 rounded-lg border text-left cursor-pointer transition-colors ${
                    exportScope === 'all'
                      ? 'border-blue-500 bg-blue-50/70 text-blue-900 font-semibold'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  全部联系人 ({contacts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setExportScope('selected')}
                  disabled={selectedIds.size === 0}
                  className={`p-2 rounded-lg border text-left transition-colors ${
                    selectedIds.size === 0
                      ? 'opacity-50 cursor-not-allowed border-slate-200 text-slate-400'
                      : exportScope === 'selected'
                      ? 'border-blue-500 bg-blue-50/70 text-blue-900 font-semibold cursor-pointer'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700 cursor-pointer'
                  }`}
                >
                  已选中的联系人 ({selectedIds.size})
                </button>
              </div>
            </div>

            {/* Filename */}
            <div className="space-y-1.5">
              <label className="block font-semibold text-slate-700">导出文件名</label>
              <input
                type="text"
                value={filename}
                onChange={e => setFilename(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* vCard Version */}
            <div className="space-y-1.5">
              <label className="block font-semibold text-slate-700">
                vCard 版本规范
              </label>
              <div className="space-y-1.5">
                <label className="flex items-start gap-2.5 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="radio"
                    name="vcard-version"
                    value="3.0"
                    checked={version === '3.0'}
                    onChange={() => setVersion('3.0')}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-800">vCard 3.0</span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-medium">
                        通用推荐
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      完美兼容 iOS、Android、微信、Outlook、Google Contacts
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="radio"
                    name="vcard-version"
                    value="2.1"
                    checked={version === '2.1'}
                    onChange={() => setVersion('2.1')}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-800">vCard 2.1</span>
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded">
                        传统设备
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      适用于老式功能机、车载蓝牙导航或老版本安卓通讯录
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="radio"
                    name="vcard-version"
                    value="4.0"
                    checked={version === '4.0'}
                    onChange={() => setVersion('4.0')}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-bold text-slate-800">vCard 4.0 (RFC 6350)</span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      最新互联网标准格式
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Encoding Selection (if 2.1) */}
            {version === '2.1' && (
              <div className="space-y-1.5 pt-1">
                <label className="block font-semibold text-slate-700">编码格式</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEncoding('utf-8')}
                    className={`p-1.5 rounded-lg border text-center cursor-pointer ${
                      encoding === 'utf-8'
                        ? 'border-blue-500 bg-blue-50 text-blue-800 font-bold'
                        : 'border-slate-200 text-slate-700'
                    }`}
                  >
                    UTF-8 纯文本
                  </button>
                  <button
                    type="button"
                    onClick={() => setEncoding('quoted-printable')}
                    className={`p-1.5 rounded-lg border text-center cursor-pointer ${
                      encoding === 'quoted-printable'
                        ? 'border-blue-500 bg-blue-50 text-blue-800 font-bold'
                        : 'border-slate-200 text-slate-700'
                    }`}
                  >
                    Quoted-Printable
                  </button>
                </div>
              </div>
            )}

            {/* Companion exports */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <span className="font-semibold text-slate-700 block">
                导出为格式1表格文件
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => exportContactsToExcel(targetContacts)}
                  className="p-2 rounded-lg border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100/50 text-emerald-800 font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  Excel (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={() => exportContactsToCsv(targetContacts)}
                  className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  CSV 格式
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Live VCF Code Preview */}
        <div className="lg:col-span-2">
          <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-lg flex flex-col h-[520px]">
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-blue-400" />
                <span className="font-mono text-slate-200">
                  {filename}
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  {targetContacts.length} 个联系人卡片
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyVcf}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition-colors cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">已复制源码</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>复制源码</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleDownloadVcf}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  下载 .vcf
                </button>
              </div>
            </div>

            {/* Code Body */}
            <div className="flex-1 overflow-auto p-4 font-mono text-[11px] text-emerald-400 bg-slate-950/60 leading-relaxed">
              <pre className="whitespace-pre">{vcfOutput}</pre>
            </div>

            {/* Footer tip */}
            <div className="px-4 py-2 border-t border-slate-800/80 bg-slate-900/80 text-[11px] text-slate-400 flex items-center justify-between">
              <span>可直接在手机通过微信传输、邮件发送或导入通讯录使用</span>
              <span className="text-slate-500 font-mono">
                {new Blob([vcfOutput]).size} bytes
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
