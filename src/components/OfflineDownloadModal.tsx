import React, { useState } from 'react';
import {
  X,
  Package,
  Globe,
  Download,
  CheckCircle2,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { downloadStandaloneHtml } from '../utils/offlinePackager';

interface OfflineDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OfflineDownloadModal: React.FC<OfflineDownloadModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [downloadingHtml, setDownloadingHtml] = useState(false);

  if (!isOpen) return null;

  const handleDownloadHtml = async () => {
    try {
      setDownloadingHtml(true);
      await downloadStandaloneHtml();
    } finally {
      setDownloadingHtml(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-linear-to-r from-purple-50 to-indigo-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                打包下载离线网页版
              </h3>
              <p className="text-[11px] text-slate-500">
                单文件独立 HTML · 双击直接打开使用 · 完全离线运行
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
        <div className="p-5 space-y-4 text-xs">
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm shrink-0">
                <Globe className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-slate-900 text-sm">
                    单文件离线网页版 (.html)
                  </h4>
                  <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.2 rounded-full font-medium">
                    打开即用
                  </span>
                </div>
                <p className="text-slate-600 text-xs leading-relaxed">
                  所有界面、样式、Excel 表格解析引擎及 vCard 编码器已<strong>全部打包内嵌至单个 HTML 文件</strong>。
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-emerald-900 font-medium pt-1">
              <div className="flex items-center gap-1.5 bg-white/80 p-2 rounded-lg border border-emerald-200/60">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>双击秒开，无需任何软件环境</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white/80 p-2 rounded-lg border border-emerald-200/60">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>完全离线，不依赖任何网络</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white/80 p-2 rounded-lg border border-emerald-200/60">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>永久免费使用，无需额外付费</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white/80 p-2 rounded-lg border border-emerald-200/60">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Windows / Mac / 手机通用</span>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleDownloadHtml}
                disabled={downloadingHtml}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold rounded-lg shadow-sm cursor-pointer text-xs transition-colors"
              >
                <Download className="w-4 h-4" />
                {downloadingHtml ? '正在打包下载...' : '立即下载 (阚哥不求人转换器_离线版.html)'}
              </button>
            </div>
          </div>

          {/* Privacy Note */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-slate-500 text-[11px] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              安全性保障：离线单文件运行在您本机的浏览器沙箱中，通讯录数据绝不上云，安全可靠。
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
