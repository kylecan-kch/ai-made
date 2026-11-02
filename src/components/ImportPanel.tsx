import React, { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  FileSpreadsheet,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Download,
  Copy,
  Layers,
} from 'lucide-react';
import { Contact } from '../types/contact';
import { parseVCard } from '../utils/vcard';
import { decodeTextBuffer } from '../utils/encoding';
import { parseSpreadsheetBuffer, FORMAT1_COLUMNS, XLS_UNSUPPORTED_MESSAGE } from '../utils/tableFormat';

interface ImportPanelProps {
  onContactsImported: (contacts: Contact[], mode: 'replace' | 'append', sourceName: string) => void;
  onDownloadTemplate: () => void;
  onGoToTable: () => void;
}

export const ImportPanel: React.FC<ImportPanelProps> = ({
  onContactsImported,
  onDownloadTemplate,
  onGoToTable,
}) => {
  const [importMode, setImportMode] = useState<'replace' | 'append'>('replace');
  const [isVcfDragging, setIsVcfDragging] = useState(false);
  const [isExcelDragging, setIsExcelDragging] = useState(false);
  const [showVcfPaste, setShowVcfPaste] = useState(false);
  const [rawVcfText, setRawVcfText] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const vcfInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  const handleVcfFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        // Read raw bytes so GBK / GB18030 / UTF-16 files are detected instead of decoded as UTF-8 mojibake
        const text = decodeTextBuffer(e.target?.result as ArrayBuffer);
        const parsed = parseVCard(text);
        if (parsed.length === 0) {
          setStatusMessage({
            type: 'error',
            text: '未能从该文件中解析出有效的 vCard 联系人，请检查文件格式是否为标准 .vcf / .vcard。',
          });
          return;
        }
        onContactsImported(parsed, importMode, file.name);
        setStatusMessage({
          type: 'success',
          text: `成功解析 VCF 文件「${file.name}」，读取到 ${parsed.length} 位联系人详细信息！`,
        });
      } catch (err: any) {
        setStatusMessage({
          type: 'error',
          text: `解析失败: ${err.message || '未知错误'}`,
        });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleExcelFile = (file: File) => {
    if (/\.xls$/i.test(file.name)) {
      setStatusMessage({ type: 'error', text: XLS_UNSUPPORTED_MESSAGE });
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const parsed = parseSpreadsheetBuffer(buffer);
        if (parsed.length === 0) {
          setStatusMessage({
            type: 'error',
            text: '未能从表格中识别出联系人数据，请确保表格包含「姓名」、「主要电话」或「电子邮箱」等列。',
          });
          return;
        }
        onContactsImported(parsed, importMode, file.name);
        setStatusMessage({
          type: 'success',
          text: `成功导入表格「${file.name}」，识别出 ${parsed.length} 位联系人！已转为标准格式1。`,
        });
      } catch (err: any) {
        setStatusMessage({
          type: 'error',
          text: `表格读取失败: ${err.message || '未知错误'}`,
        });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleParsePastedVcf = () => {
    if (!rawVcfText.trim()) return;
    const parsed = parseVCard(rawVcfText);
    if (parsed.length === 0) {
      setStatusMessage({
        type: 'error',
        text: '粘贴的内容中未检测到有效的 BEGIN:VCARD ... END:VCARD 块。',
      });
      return;
    }
    onContactsImported(parsed, importMode, '粘贴文本');
    setStatusMessage({
      type: 'success',
      text: `已成功解析粘贴的 VCF 内容，生成 ${parsed.length} 位联系人数据！`,
    });
    setRawVcfText('');
    setShowVcfPaste(false);
  };

  const sampleVcfSnippet = `BEGIN:VCARD
VERSION:3.0
FN:陈思远
N:陈;思远;;;
ORG:极客未来网络;云原生架构部
TITLE:主任架构师
TEL;TYPE=CELL,VOICE:13900139000
TEL;TYPE=WORK,VOICE:0755-26889900
EMAIL;TYPE=INTERNET,WORK:chensy@geekfuture.com
ADR;TYPE=WORK:;;南山区科技南一路12号;深圳市;广东省;518000;中国
NOTE:微信同号，主导微服务治理项目
BDAY:1991-08-20
URL:https://geekfuture.com
CATEGORIES:技术专家,重要合作伙伴
END:VCARD`;

  return (
    <div className="space-y-6">
      {/* Top Banner & Mode Toggle */}
      <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-600" />
              数据导入与智能解析中心
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              支持上传 <strong>.vcf / .vcard</strong> 文件自动解析为格式1表格；或上传 <strong>.xlsx / .csv</strong> 表格生成 .vcf
            </p>
          </div>

          {/* Import Mode: Replace vs Append */}
          <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200 text-xs">
            <span className="text-slate-500 px-2 font-medium">导入策略:</span>
            <button
              onClick={() => setImportMode('replace')}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                importMode === 'replace'
                  ? 'bg-white text-blue-700 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              覆盖现有数据
            </button>
            <button
              onClick={() => setImportMode('append')}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                importMode === 'append'
                  ? 'bg-white text-blue-700 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              追加合并到现有
            </button>
          </div>
        </div>

        {/* Status Toast */}
        {statusMessage && (
          <div
            className={`mt-4 p-3.5 rounded-lg flex items-center justify-between gap-3 text-xs ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
            {statusMessage.type === 'success' && (
              <button
                onClick={onGoToTable}
                className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-900 underline underline-offset-2 shrink-0 cursor-pointer"
              >
                前往查看表格数据 <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Two Column Dropzones */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Parse .vcf File */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-linear-to-r from-blue-50/50 to-indigo-50/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                  VCF
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    解析 .vcf 联系人文件
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    自动将 vCard 解析为标准格式1表格
                  </p>
                </div>
              </div>
              <span className="text-[11px] text-blue-700 font-medium bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                支持 vCard 2.1/3.0/4.0
              </span>
            </div>
          </div>

          <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
            {/* Drag Drop Area */}
            <div
              onDragOver={e => {
                e.preventDefault();
                setIsVcfDragging(true);
              }}
              onDragLeave={() => setIsVcfDragging(false)}
              onDrop={e => {
                e.preventDefault();
                setIsVcfDragging(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleVcfFile(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => vcfInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center ${
                isVcfDragging
                  ? 'border-blue-500 bg-blue-50/70 scale-[0.99]'
                  : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50/80 bg-slate-50/30'
              }`}
            >
              <input
                ref={vcfInputRef}
                type="file"
                accept=".vcf,.vcard,text/vcard,text/x-vcard"
                className="hidden"
                onChange={e => {
                  if (e.target.files && e.target.files[0]) {
                    handleVcfFile(e.target.files[0]);
                  }
                }}
              />
              <div className="w-12 h-12 rounded-full bg-blue-100/70 text-blue-600 flex items-center justify-center mb-3">
                <FileText className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-700 mb-1">
                点击或拖拽 .vcf / .vcard 文件到这里
              </p>
              <p className="text-xs text-slate-400">
                支持微信、iOS通讯录、安卓、Outlook 或 Google 导出的联系人文件
              </p>
            </div>

            {/* Quick helper triggers */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => {
                  setRawVcfText(sampleVcfSnippet);
                  setShowVcfPaste(true);
                }}
                className="text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                填入测试 vCard 代码
              </button>
              <button
                type="button"
                onClick={() => setShowVcfPaste(!showVcfPaste)}
                className="text-slate-600 hover:text-slate-900 font-medium"
              >
                {showVcfPaste ? '收起文本粘贴' : '粘贴 vCard 源码解析'}
              </button>
            </div>

            {/* Paste VCF textarea */}
            {showVcfPaste && (
              <div className="pt-2 space-y-2">
                <textarea
                  value={rawVcfText}
                  onChange={e => setRawVcfText(e.target.value)}
                  placeholder="在此直接粘贴 BEGIN:VCARD ... END:VCARD 文本内容..."
                  rows={4}
                  className="w-full text-xs font-mono p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-900 text-slate-100"
                />
                <button
                  type="button"
                  onClick={handleParsePastedVcf}
                  disabled={!rawVcfText.trim()}
                  className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer"
                >
                  解析并导入文本内容
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Import Table (Format 1) to generate VCF */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-linear-to-r from-emerald-50/50 to-teal-50/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                  XLSX
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    导入表格（格式1）生成 .vcf
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    支持 Excel / CSV 表格智能映射与导出
                  </p>
                </div>
              </div>
              <span className="text-[11px] text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                支持 .xlsx / .csv
              </span>
            </div>
          </div>

          <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
            {/* Drag Drop Area */}
            <div
              onDragOver={e => {
                e.preventDefault();
                setIsExcelDragging(true);
              }}
              onDragLeave={() => setIsExcelDragging(false)}
              onDrop={e => {
                e.preventDefault();
                setIsExcelDragging(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleExcelFile(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => excelInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center ${
                isExcelDragging
                  ? 'border-emerald-500 bg-emerald-50/70 scale-[0.99]'
                  : 'border-slate-300 hover:border-emerald-400 hover:bg-slate-50/80 bg-slate-50/30'
              }`}
            >
              <input
                ref={excelInputRef}
                type="file"
                accept=".xlsx,.csv"
                className="hidden"
                onChange={e => {
                  if (e.target.files && e.target.files[0]) {
                    handleExcelFile(e.target.files[0]);
                  }
                }}
              />
              <div className="w-12 h-12 rounded-full bg-emerald-100/70 text-emerald-600 flex items-center justify-center mb-3">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-700 mb-1">
                点击或拖拽 Excel / CSV 表格文件到这里
              </p>
              <p className="text-xs text-slate-400">
                自动识别「姓名、主要电话、公司、邮箱、地址、备注」等标准列
              </p>
            </div>

            {/* Template Download & Format Guide */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={onDownloadTemplate}
                className="text-emerald-700 hover:text-emerald-800 font-semibold inline-flex items-center gap-1.5 cursor-pointer bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200"
              >
                <Download className="w-3.5 h-3.5" />
                获取标准格式1模板 (.xlsx)
              </button>

              <div className="text-[11px] text-slate-500 flex items-center gap-1">
                <span>包含 20 项标准联系人字段</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Schema reference accordion / info box */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs">
        <div className="flex items-center gap-2 font-semibold text-slate-700 mb-2">
          <Layers className="w-4 h-4 text-blue-600" />
          <span>格式1 标准数据字段规范（双向完全对应）：</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FORMAT1_COLUMNS.map((col, idx) => (
            <span
              key={col}
              className="px-2 py-0.5 bg-white text-slate-700 border border-slate-200 rounded text-[11px] shadow-2xs font-mono"
            >
              {col}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
