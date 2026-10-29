import JSZip from 'jszip';

/**
 * Fetch the pre-compiled standalone single-file HTML
 */
export async function getStandaloneHtmlContent(): Promise<string> {
  try {
    const res = await fetch('/standalone.html');
    if (res.ok) {
      return await res.text();
    }
  } catch (e) {
    console.warn('Failed to fetch standalone.html, falling back to current document', e);
  }
  // Fallback: serialize current document HTML
  return '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
}

/**
 * Download single-file standalone HTML directly
 */
export async function downloadStandaloneHtml() {
  const htmlContent = await getStandaloneHtmlContent();
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'VCF联系人互转助手_离线单文件版.html';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Download a Portable Offline Desktop Package (.zip) containing:
 * 1. Standalone .html
 * 2. Windows Desktop App Launcher (.bat) running Edge/Chrome in Native App Window mode (no URL bar)
 * 3. 1-Click native Windows .exe compiler script using built-in PowerShell C# compiler
 * 4. User manual
 */
export async function downloadOfflineDesktopZip() {
  const zip = new JSZip();
  const htmlContent = await getStandaloneHtmlContent();

  // 1. Single-file offline HTML
  zip.file('VCF联系人互转助手_离线版.html', htmlContent);

  // 2. Windows Desktop Launcher (Runs in pure app window mode like native EXE)
  const batContent = `@echo off
chcp 65001 >nul
title 启动 VCF 联系人互转助手 - 桌面端
set "HTML_FILE=%~dp0VCF联系人互转助手_离线版.html"

echo 正在启动 VCF 联系人互转助手 桌面独立窗口...

:: 优先检测系统内置的 Edge 浏览器独立应用模式（Windows 10/11 自带，无地址栏、无多余标签页，体验如同原生 exe）
if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" (
    start "" "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" --app="file:///%HTML_FILE%" --window-size=1280,850
    exit
)

if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" (
    start "" "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" --app="file:///%HTML_FILE%" --window-size=1280,850
    exit
)

:: 尝试 Google Chrome 应用模式
if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" (
    start "" "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" --app="file:///%HTML_FILE%" --window-size=1280,850
    exit
)

:: 默认系统浏览器打开
start "" "%HTML_FILE%"
exit
`;
  zip.file('启动_Windows桌面应用.bat', batContent);

  // 3. Native Windows EXE Generator script (PowerShell C# compiler without needing Visual Studio)
  const psCompileContent = `# Windows 原生 EXE 套壳编译器脚本
# 使用 Windows 内置 .NET C# 编译器将网页打包为真正的独立 VCF_Helper.exe

$htmlPath = "$PSScriptRoot\\VCF联系人互转助手_离线版.html"
$outExe = "$PSScriptRoot\\VCF联系人互转助手.exe"

$csharpCode = @"
using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

public class Program {
    [STAThread]
    public static void Main() {
        string appDir = AppDomain.CurrentDomain.BaseDirectory;
        string htmlFile = Path.Combine(appDir, "VCF联系人互转助手_离线版.html");
        
        if (!File.Exists(htmlFile)) {
            MessageBox.Show("未找到网页文件: " + htmlFile, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        string edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft\\\\Edge\\\\Application\\\\msedge.exe");
        if (!File.Exists(edgePath)) {
            edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft\\\\Edge\\\\Application\\\\msedge.exe");
        }

        if (File.Exists(edgePath)) {
            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = edgePath;
            psi.Arguments = "--app=\\"file:///" + htmlFile.Replace("\\\\", "/") + "\\" --window-size=1280,850";
            psi.UseShellExecute = true;
            Process.Start(psi);
        } else {
            Process.Start(htmlFile);
        }
    }
}
"@

Write-Host "正在使用 Windows 内置 .NET 编译独立 EXE 套壳程序..." -ForegroundColor Cyan
Add-Type -TypeDefinition $csharpCode -OutputAssembly $outExe -OutputType WindowsApplication -ReferencedAssemblies "System.Windows.Forms.dll"

if (Test-Path $outExe) {
    Write-Host "✅ 编译成功！生成独立程序: $outExe" -ForegroundColor Green
    Write-Host "双击 $outExe 即可直接打开！" -ForegroundColor Yellow
} else {
    Write-Host "❌ 编译未完成，您可以直接双击 '启动_Windows桌面应用.bat' 或直接双击 HTML 离线运行。" -ForegroundColor Red
}
pause
`;
  zip.file('一键生成独立EXE程序.ps1', psCompileContent);

  // 4. Bat trigger for the ps1
  const batRunPs = `@echo off
chcp 65001 >nul
powershell -ExecutionPolicy Bypass -File "%~dp0一键生成独立EXE程序.ps1"
`;
  zip.file('一键生成独立EXE程序.bat', batRunPs);

  // 5. Readme instructions
  const readme = `========================================================
VCF Contacts Hub - 离线独立网页与桌面版使用说明
========================================================

【方案一：单文件直接使用（最推荐，全平台兼容）】
直接双击打开「VCF联系人互转助手_离线版.html」：
- 无需安装任何环境（Node.js / Python / Java 统统不需要）。
- 无需网络连接，完全离线运行。
- 完美支持 Windows、macOS、Linux、iPad、手机等任意设备。

【方案二：Windows 原生桌面独立窗口模式】
双击运行「启动_Windows桌面应用.bat」：
- 调用系统自带的 Edge/Chrome 原生 App 框架。
- 无浏览器地址栏、无多余标签页，体验如同原生安装的桌面软件！

【方案三：生成真正的独立 .exe 程序】
双击运行「一键生成独立EXE程序.bat」：
- 会调用 Windows 系统自带的 .NET 编译器，瞬间在当前目录生成「VCF联系人互转助手.exe」。
- 双击该 .exe 即可一键启动！

数据安全说明：
所有联系人解析、Excel导入导出与VCF文件生成，100%在您的本地内存中完成，绝不向任何外部服务器上传通讯录数据，绝对安全隐私。
`;
  zip.file('使用说明与说明文档.txt', readme);

  // Generate zip and download
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'VCF联系人互转助手_免安装离线包.zip';
  a.click();
  URL.revokeObjectURL(url);
}
