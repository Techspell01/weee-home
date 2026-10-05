// Messages this person should see: not cleared by them and not deleted for them.
export function visibleMessages(hh, me) {
  const mine = hh.members.find(m => m.user_id === me);
  const clearedAt = mine?.chat_cleared_at ? Date.parse(mine.chat_cleared_at) : 0;
  const hidden = new Set(hh.hides.map(h => h.message_id));
  return hh.messages.filter(m => !hidden.has(m.id) && Date.parse(m.created_at) > clearedAt);
}
