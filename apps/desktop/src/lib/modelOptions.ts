export interface ModelOption {
  id: string;
  /** Ainda não confirmado na conta (salvo antes ou digitado manualmente). */
  unverified: boolean;
}

const NON_CHAT_PATTERN =
  /(embed|whisper|transcri|tts|dall-e|moderation|realtime|image|audio|sora|davinci|babbage|search-preview|aqa)/i;

export function isChatModel(modelId: string): boolean {
  return !NON_CHAT_PATTERN.test(modelId);
}

/**
 * Lista do seletor: modelos de chat da conta (quando buscados) ou o catálogo embutido.
 * O modelo salvo sempre aparece, mesmo que não esteja em nenhuma das listas.
 */
export function buildModelOptions(
  catalogIds: string[],
  fetchedIds: string[] | undefined,
  selectedId: string,
  selection?: { includeAll?: boolean }
): ModelOption[] {
  const source = fetchedIds
    ? selection?.includeAll
      ? fetchedIds
      : fetchedIds.filter(isChatModel)
    : catalogIds;
  const ids = [...new Set(source)].sort((a, b) => a.localeCompare(b));
  const options: ModelOption[] = ids.map((id) => ({ id, unverified: false }));
  if (selectedId && !ids.includes(selectedId)) {
    options.unshift({ id: selectedId, unverified: Boolean(fetchedIds) });
  }
  return options;
}

function terms(query: string): string[] {
  return query.trim().toLowerCase().split(/[\s/_]+/).filter(Boolean);
}

/** Filtra por todos os termos; prefixos e correspondências exatas vêm primeiro. */
export function filterModelOptions(options: ModelOption[], query: string): ModelOption[] {
  const parts = terms(query);
  if (!parts.length) {
    return options;
  }
  const scored: Array<{ option: ModelOption; score: number; index: number }> = [];
  options.forEach((option, index) => {
    const id = option.id.toLowerCase();
    if (!parts.every((part) => id.includes(part))) {
      return;
    }
    const joined = parts.join(" ");
    const score = id === joined ? 0 : id.startsWith(parts[0]) ? 1 : 2;
    scored.push({ option, score, index });
  });
  return scored
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((entry) => entry.option);
}

/** Trechos [início, fim) do texto que casam com algum termo da busca, já mesclados. */
export function matchRanges(text: string, query: string): Array<[number, number]> {
  const lower = text.toLowerCase();
  const ranges: Array<[number, number]> = [];
  for (const part of terms(query)) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(part, from);
      if (at === -1) break;
      ranges.push([at, at + part.length]);
      from = at + part.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) {
      last[1] = Math.max(last[1], range[1]);
    } else {
      merged.push([range[0], range[1]]);
    }
  }
  return merged;
}

/** Texto digitado vira um id de modelo válido para "usar mesmo assim"? */
export function customModelCandidate(options: ModelOption[], query: string): string | null {
  const value = query.trim();
  if (!value || /\s/.test(value)) {
    return null;
  }
  return options.some((option) => option.id === value) ? null : value;
}
