const UA = 'blog-autopilot/1.0';
const TIMEOUT_MS = 10_000;
const PLACEHOLDER_URL = 'https://via.placeholder.com/1200x630.png?text=No+Image';

export interface ImageSlot {
  slot_id: string;
  search_query: string;
  alt_text: string;
}

export interface ImageResult {
  slot_id: string;
  image_url: string;
  photographer: string | null;
  source: 'pexels' | 'pixabay' | 'placeholder';
  alt_text: string;
}

function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

async function tryPexels(
  query: string,
): Promise<{ url: string; photographer: string } | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  try {
    const res = await fetchWithTimeout(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=3`,
      { headers: { Authorization: key, 'User-Agent': UA } },
    );
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    if (!data.photos?.length) return null;
    const p = data.photos[0];
    return { url: p.src.large as string, photographer: p.photographer as string };
  } catch {
    return null;
  }
}

async function tryPixabay(
  query: string,
): Promise<{ url: string; photographer: string } | null> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return null;
  try {
    const res = await fetchWithTimeout(
      `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(query)}&per_page=3&safesearch=true&image_type=photo`,
      { headers: { 'User-Agent': UA } },
    );
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    if (!data.hits?.length) return null;
    const h = data.hits[0];
    return { url: h.largeImageURL as string, photographer: h.user as string };
  } catch {
    return null;
  }
}

export async function fetchForSlots(slots: ImageSlot[]): Promise<ImageResult[]> {
  return Promise.all(
    slots.map(async (slot) => {
      const pexels = await tryPexels(slot.search_query);
      if (pexels) {
        return {
          slot_id: slot.slot_id,
          image_url: pexels.url,
          photographer: pexels.photographer,
          source: 'pexels' as const,
          alt_text: slot.alt_text,
        };
      }

      const pixabay = await tryPixabay(slot.search_query);
      if (pixabay) {
        return {
          slot_id: slot.slot_id,
          image_url: pixabay.url,
          photographer: pixabay.photographer,
          source: 'pixabay' as const,
          alt_text: slot.alt_text,
        };
      }

      return {
        slot_id: slot.slot_id,
        image_url: PLACEHOLDER_URL,
        photographer: null,
        source: 'placeholder' as const,
        alt_text: slot.alt_text,
      };
    }),
  );
}
