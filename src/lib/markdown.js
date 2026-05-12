// Lightweight markdown → HTML for model output.
// Keeps it simple: headings, bold, italic, code, bullet & numbered lists, paragraphs.
export function renderMarkdown(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h3>$1</h3>')
    .replace(/^#### (.*$)/gm, '<h4>$1</h4>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^(\d+)\. (.*$)/gm, '<li data-n="$1">$2</li>')
    .replace(/^- (.*$)/gm, '<li class="b">$1</li>')
    .replace(/(<li class="b">.*?<\/li>(\n|$))+/gs, (m) => '<ul>' + m.replace(/\n/g, '') + '</ul>')
    .replace(
      /(<li data-n=.*?<\/li>(\n|$))+/gs,
      (m) => '<ol>' + m.replace(/\n/g, '').replace(/ data-n="\d+"/g, '') + '</ol>'
    )
    .replace(/\n\n/g, '</p><p>')
    .replace(/^([^<].+)$/gm, (m) => (m.startsWith('<') ? m : '<p>' + m + '</p>'))
    .replace(/<p><\/p>/g, '')
    .replace(/<p>(<h[34]>)/g, '$1')
    .replace(/(<\/h[34]>)<\/p>/g, '$1')
    .replace(/<p>(<ul>|<ol>)/g, '$1')
    .replace(/(<\/ul>|<\/ol>)<\/p>/g, '$1');
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
