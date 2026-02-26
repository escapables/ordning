function splitIntoOverlapGroups(items) {
  const groups = [];
  let group = [];
  let maxEnd = 0;

  items.forEach((item) => {
    if (group.length === 0) {
      group = [item];
      maxEnd = item.endMinutes;
      return;
    }
    if (item.startMinutes < maxEnd) {
      group.push(item);
      maxEnd = Math.max(maxEnd, item.endMinutes);
      return;
    }
    groups.push(group);
    group = [item];
    maxEnd = item.endMinutes;
  });

  if (group.length > 0) {
    groups.push(group);
  }

  return groups;
}

function assignColumns(group) {
  const active = [];
  let maxColumns = 1;

  group.forEach((item) => {
    for (let index = active.length - 1; index >= 0; index -= 1) {
      if (active[index].endMinutes <= item.startMinutes) {
        active.splice(index, 1);
      }
    }
    const usedColumns = new Set(active.map((entry) => entry.column));
    let column = 0;
    while (usedColumns.has(column)) {
      column += 1;
    }
    item.column = column;
    active.push({ endMinutes: item.endMinutes, column });
    maxColumns = Math.max(maxColumns, column + 1);
  });

  group.forEach((item) => {
    item.totalColumns = maxColumns;
  });
}

export function layoutOverlapItems(items) {
  const sorted = [...items].sort(
    (left, right) => left.startMinutes - right.startMinutes || left.endMinutes - right.endMinutes
  );
  splitIntoOverlapGroups(sorted).forEach(assignColumns);
  return sorted;
}
