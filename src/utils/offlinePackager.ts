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
  a.download = '阚哥不求人转换器_离线版.html';
  a.click();
  URL.revokeObjectURL(url);
}
