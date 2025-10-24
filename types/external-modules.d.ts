declare module '@mozilla/readability' {
  export class Readability {
    constructor(document: any);
    parse(): {
      title?: string | null;
      textContent?: string | null;
    } | null;
  }
}

declare module 'jsdom' {
  export class JSDOM {
    constructor(html: string, options?: { url?: string });
    window: {
      document: any;
      close(): void;
    };
  }
}

declare module '@supabase/supabase-js' {
  export type PostgrestError = {
    code?: string | null;
    message?: string | null;
  };

  export type SupabaseClient = any;

  export function createClient(
    url: string,
    key: string,
    options?: Record<string, unknown>
  ): SupabaseClient;
}

declare module 'gpt-tokenizer' {
  export function encode(value: string): number[];
}

declare module 'openai' {
  export type EmbeddingResponse = {
    data: Array<{ embedding: number[] }>;
  };

  export default class OpenAI {
    constructor(config: { apiKey: string });
    embeddings: {
      create(input: {
        model: string;
        input: string[] | string;
      }): Promise<EmbeddingResponse>;
    };
  }
}
