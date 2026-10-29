import React, { useState } from 'react';
import {
  X,
  Package,
  Globe,
  Monitor,
  Download,
  CheckCircle2,
  Terminal,
  ShieldCheck,
  FileCode,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { downloadStandaloneHtml, downloadOfflineDesktopZip } from '../utils/offlinePackager';

interface OfflineDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OfflineDownloadModal: React.FC<OfflineDownloadModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [downloadingHtml, setDownloadingHtml] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);

  if (!isOpen) return null;

  const handleDownloadHtml = async () => {
    try {
      setDownloadingHtml(true);
      await downloadStandaloneHtml();
    } finally {
      setDownloadingHtml(false);
    }
  };

  const handleDownloadZip = async () => {
    try {
      setDownloadingZip(true);
      await downloadOfflineDesktopZip();
    } finally {
      setDownloadingZip(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-linear-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                打包为离线单网页 / 套壳 EXE 桌面版
              </h3>
              <p className="text-[11px] text-slate-500">
                支持脱离浏览器服务器，双击直接在本地运行使用
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
        <div className="p-5 space-y-5 text-xs">
          {/* Option 1: Single File HTML (Recommended) */}
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50/70 transition-colors space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm shrink-0">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-slate-900 text-sm">
                      方案一：单文件离线网页版 (.html)
                    </h4>
                    <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.2 rounded-full font-medium">
                      推荐 · 打开即用
                    </span>
                  </div>
                  <p className="text-slate-600 text-xs mt-1 leading-relaxed">
                    所有 React 代码、样式表、图标与 Excel/VCF 解析引擎已<strong>全部内嵌至单个 HTML 文件</strong>。下载后直接双击即可运行，无需 Node.js、无需服务器、无需连网。
                  </p>
                  <div className="flex items-center gap-3 text-[11px] text-emerald-800 font-medium mt-2">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 双击即开
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 零依赖环境
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 全平台通用 (Windows/Mac/手机)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-1 flex items-center justify-end">
              <button
                type="button"
                onClick={handleDownloadHtml}
                disabled={downloadingHtml}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-xs cursor-pointer text-xs"
              >
                <Download className="w-3.5 h-3.5" />
                {downloadingHtml ? '正在生成并打包...' : '下载离线单网页 (VCF联系人互转助手_离线版.html)'}
              </button>
            </div>
          </div>

          {/* Option 2: Windows Native Wrapper & EXE Zip */}
          <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 hover:bg-blue-50/70 transition-colors space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">
                  <Monitor className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-slate-900 text-sm">
                      方案二：Windows 桌面免安装包 + 套壳 EXE (.zip)
                    </h4>
                    <span className="text-[10px] bg-blue-100 text-blue-700 border border-blue-300 px-2 py-0.2 rounded-full font-medium">
                      原生桌面体验
                    </span>
                  </div>
                  <p className="text-slate-600 text-xs mt-1 leading-relaxed">
                    解压后双击<strong>「启动_Windows桌面应用.bat」</strong>即可弹出原生无地址栏、无多余标签页的独立桌面程序窗口；内附<strong>「一键生成独立EXE程序.bat」</strong>，利用 Windows 内置 .NET C# 编译器一秒生成独立 <code>VCF联系人互转助手.exe</code>！
                  </p>
                  <div className="flex items-center gap-3 text-[11px] text-blue-800 font-medium mt-2">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 无浏览器地址栏
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 内置独立 EXE 编译器
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 解压即用
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-1 flex items-center justify-end">
              <button
                type="button"
                onClick={handleDownloadZip}
                disabled={downloadingZip}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-xs cursor-pointer text-xs"
              >
                <Download className="w-3.5 h-3.5" />
                {downloadingZip ? '正在打包压缩包...' : '下载免安装桌面版套件 (.zip)'}
              </button>
            </div>
          </div>

          {/* Privacy Note */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-slate-500 text-[11px] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              安全性保障：离线单文件运行在您本机的浏览器沙箱内，不连接任何远程接口，您的通讯录姓名、号码与商业数据绝不会离开您的电脑。
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            完成并关闭
          </button>
        </div>
      </div>
    </div>
  );
};
