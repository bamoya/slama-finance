export const textToEmailHtml = (text: string) =>
  '<p>' +
  text
    .replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
    )
    .replace(/\n/g, '<br>') +
  '</p>'
