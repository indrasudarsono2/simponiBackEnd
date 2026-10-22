export const categoryMatsCounts = (configuration, groups) => {
  const categories = new Set(groups.map(group => group.mandatoryItemId).filter(Boolean));
  return new Map((configuration?.allocations || []).filter(item => categories.has(item.mandatoryItemId) && item.quantity > 0).map(item => [item.mandatoryItemId, Number(item.quantity)]));
};

export const matchesCategoryMatsCounts = (selections, expected) => {
  const counts = new Map();
  for (const item of selections) counts.set(item.mandatoryItemId, (counts.get(item.mandatoryItemId) || 0) + 1);
  return counts.size === expected.size && [...expected].every(([id, quantity]) => counts.get(id) === quantity);
};
