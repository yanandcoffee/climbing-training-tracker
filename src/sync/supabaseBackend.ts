import type { SupabaseClient } from "@supabase/supabase-js";
import type { RemoteBackend, Row, SettingsBackend, SettingsRow } from "./engine";

const PAGE = 1000;

export function createSupabaseBackend(
  client: SupabaseClient,
  userId: string,
): RemoteBackend {
  return {
    async pull(since) {
      const out: Row[] = [];
      for (let from = 0; ; from += PAGE) {
        let q = client
          .from("records")
          .select("kind,id,data,updated_at,deleted_at,synced_at")
          .order("synced_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        // gte (not gt): rows sharing the watermark's timestamp are never missed;
        // re-merging them is a no-op.
        if (since) q = q.gte("synced_at", since);
        const { data, error } = await q;
        if (error) throw error;
        out.push(...((data ?? []) as Row[]));
        if (!data || data.length < PAGE) break;
      }
      return out;
    },

    async push(rows) {
      if (!rows.length) return;
      const { error } = await client.from("records").upsert(
        rows.map((r) => ({
          user_id: userId,
          kind: r.kind,
          id: r.id,
          data: r.data,
          updated_at: r.updated_at,
          deleted_at: r.deleted_at,
        })),
        { onConflict: "user_id,kind,id" },
      );
      if (error) throw error;
    },
  };
}

export function createSupabaseSettingsBackend(
  client: SupabaseClient,
  userId: string,
): SettingsBackend {
  return {
    async pullSettings() {
      const { data, error } = await client
        .from("user_settings")
        .select("enabled,data,updated_at")
        .maybeSingle();
      if (error) throw error;
      return (data as SettingsRow | null) ?? null;
    },

    async pushSettings(row) {
      const { error } = await client
        .from("user_settings")
        .upsert({ user_id: userId, ...row }, { onConflict: "user_id" });
      if (error) throw error;
    },
  };
}
