export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  // Some browsers (Firefox, older Safari) only download from links that are in the document.
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking right away can cancel the download before the browser has read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
