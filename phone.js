// The fragment stays in the browser, including when requesting the encrypted data.
const phoneSource = 'https://raw.githubusercontent.com/iwearyourshirt/bfcm/snapshots/sales.json';
let phoneKey;
async function readPhoneSnapshot() {
  if (!phoneKey) {
    const encoded = location.hash.slice(1).replaceAll('-', '+').replaceAll('_', '/');
    if (!encoded) throw new Error('Open the full phone bookmark from your Mac tracker.');
    phoneKey = await crypto.subtle.importKey('raw', Uint8Array.from(atob(encoded), c => c.charCodeAt(0)), 'AES-GCM', false, ['decrypt']);
  }
  const response = await fetch(phoneSource + '?t=' + Math.floor(Date.now() / 15000), {
    cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error('Could not load the saved totals.');
  const bytes = Uint8Array.from(atob(await response.json()), c => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({name:'AES-GCM', iv:bytes.slice(0,12)}, phoneKey, bytes.slice(12));
  return JSON.parse(new TextDecoder().decode(plain));
}
