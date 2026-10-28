/** Retrieve every page of an already-filtered operational query; never show a truncated tail. */
export async function collectQueryPages<T>(
  load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 250,
): Promise<{ data: T[]; error: null } | { data: null; error: { message: string } }> {
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0) throw new RangeError("Invalid query page size");
  const data: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await load(from, from + pageSize - 1);
    if (page.error) return { data: null, error: page.error };
    const rows = page.data ?? [];
    data.push(...rows);
    if (rows.length < pageSize) return { data, error: null };
  }
}
