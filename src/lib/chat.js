// Messages this person should see: not cleared by them and not deleted for them.
export function visibleMessages(hh, me) {
  const mine = hh.members.find(m => m.user_id === me);
  const clearedAt = mine?.chat_cleared_at ? Date.parse(mine.chat_cleared_at) : 0;
  const hidden = new Set(hh.hides.map(h => h.message_id));
  return hh.messages.filter(m => !hidden.has(m.id) && Date.parse(m.created_at) > clearedAt);
}

// Split message text into plain text and web links, so links can be tapped.
const LINK = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'])/g;
export function splitLinks(text) {
  const parts = [];
  let last = 0;
  for (const m of String(text).matchAll(LINK)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ url: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
